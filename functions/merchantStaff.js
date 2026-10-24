const { STAFF_PERMISSIONS, merchantStaffGrant } = require('./merchantAccess');

const TYPES = ['restaurant', 'grocery'];
const ID = /^[A-Za-z0-9_-]{1,128}$/;

function merchantStaffFunctions({ onCall, db, REGION, HttpsError, documentId, Timestamp }) {
  const caller = async request => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage business staff.');
    const account = (await db.doc(`users/${uid}`).get()).data();
    if (account?.role !== 'merchant' || account.disabled === true || account.suspended === true) throw new HttpsError('permission-denied', 'An active merchant account is required.');
    return { uid, account };
  };
  const businessRef = (id, type) => db.doc(`${type === 'restaurant' ? 'restaurants' : 'grocery_stores'}/${id}`);
  const verifyOwner = async (uid, id, type) => {
    const [snapshot, profile] = await Promise.all([businessRef(id, type).get(), db.doc(`users/${uid}`).get()]);
    if (!snapshot.exists || snapshot.data().ownerId !== uid || profile.data()?.role !== 'merchant' || profile.data()?.disabled === true || profile.data()?.suspended === true) throw new HttpsError('permission-denied', 'Only the active verified business owner can manage staff.');
    return snapshot;
  };
  const parseBusiness = data => {
    const merchantId = documentId(data?.merchantId, 'Business ID'), merchantType = data?.merchantType;
    if (!ID.test(merchantId) || !TYPES.includes(merchantType)) throw new HttpsError('invalid-argument', 'Choose a valid business type and ID.');
    return { merchantId, merchantType };
  };
  return {
    listMerchantStaff: onCall({ operation: 'listMerchantStaff', region: REGION }, async request => {
      const { uid } = await caller(request), { merchantId, merchantType } = parseBusiness(request.data);
      await verifyOwner(uid, merchantId, merchantType);
      const snapshot = await db.collection(`merchant_staff/${merchantId}/members`).limit(100).get();
      const members = await Promise.all(snapshot.docs.map(async member => {
        const account = (await db.doc(`users/${member.id}`).get()).data();
        if (!account || account.role !== 'merchant' || account.disabled === true || account.suspended === true) return null;
        return { uid: member.id, name: account.name || '', email: account.email || '', permissions: member.data().permissions || [] };
      }));
      return { members: members.filter(Boolean) };
    }),
    grantMerchantStaffAccess: onCall({ operation: 'grantMerchantStaffAccess', region: REGION }, async request => {
      const { uid } = await caller(request), data = request.data || {}, { merchantId, merchantType } = parseBusiness(data);
      const staffUid = documentId(data.staffUid, 'Staff account ID');
      if (staffUid === uid || !Array.isArray(data.permissions) || data.permissions.length < 1 || data.permissions.length > STAFF_PERMISSIONS.length || new Set(data.permissions).size !== data.permissions.length || data.permissions.some(permission => !STAFF_PERMISSIONS.includes(permission))) throw new HttpsError('invalid-argument', 'Choose another existing merchant account and at least one valid permission.');
      await verifyOwner(uid, merchantId, merchantType);
      const memberRef = db.doc(`merchant_staff/${merchantId}/members/${staffUid}`), counterRef = db.doc(`merchant_staff/${merchantId}`), targetRef = db.doc(`users/${staffUid}`), ownerRef = db.doc(`users/${uid}`), businessDoc = businessRef(merchantId, merchantType);
      await db.runTransaction(async tx => {
        const [target, member, counter, owner, business] = await Promise.all([tx.get(targetRef), tx.get(memberRef), tx.get(counterRef), tx.get(ownerRef), tx.get(businessDoc)]), profile = target.data();
        if (owner.data()?.role !== 'merchant' || owner.data()?.disabled === true || owner.data()?.suspended === true || !business.exists || business.data().ownerId !== uid) throw new HttpsError('permission-denied', 'Only the active verified business owner can manage staff.');
        if (!target.exists || profile?.role !== 'merchant' || profile.disabled === true || profile.suspended === true || profile.accountAuthority === 'neon') throw new HttpsError('failed-precondition', 'Staff must have an active AllGo merchant account.');
        if (profile.merchantStaffAccess && (typeof profile.merchantStaffAccess !== 'object' || Array.isArray(profile.merchantStaffAccess) || Object.entries(profile.merchantStaffAccess).some(([id, grant]) => !ID.test(id) || !merchantStaffGrant({ merchantStaffAccess: { [id]: grant } }, id, grant?.merchantType)))) throw new HttpsError('failed-precondition', 'This staff account has malformed business access that needs operations review.');
        const current = { ...(profile.merchantStaffAccess || {}) };
        const existing = current[merchantId];
        if (existing && existing.ownerUid !== uid) throw new HttpsError('failed-precondition', 'This account already has access to the business under a different owner.');
        if (!existing && Object.keys(current).length >= 25) throw new HttpsError('resource-exhausted', 'This staff account has reached its business access limit.');
        const memberCount = counter.data()?.memberCount || 0;
        if (!member.exists && (!Number.isSafeInteger(memberCount) || memberCount < 0 || memberCount >= 100)) throw new HttpsError('resource-exhausted', 'This business has reached its 100-account staff limit.');
        current[merchantId] = { merchantType, ownerUid: uid, permissions: [...data.permissions].sort() };
        tx.set(memberRef, { staffUid, merchantType, permissions: [...data.permissions].sort(), grantedBy: uid, updatedAt: Timestamp.now(), createdAt: member.data()?.createdAt || Timestamp.now() });
        tx.update(targetRef, { merchantStaffAccess: current });
        if (!member.exists) tx.set(counterRef, { memberCount: memberCount + 1 });
        tx.create(db.collection('operations_audit').doc(), { operatorId: uid, action: 'merchant_staff_access_granted', target: `${merchantType}:${merchantId}:${staffUid}`, permissions: [...data.permissions].sort(), createdAt: Timestamp.now() });
      });
      return { granted: true };
    }),
    revokeMerchantStaffAccess: onCall({ operation: 'revokeMerchantStaffAccess', region: REGION }, async request => {
      const { uid } = await caller(request), { merchantId, merchantType } = parseBusiness(request.data), staffUid = documentId(request.data?.staffUid, 'Staff account ID');
      if (staffUid === uid) throw new HttpsError('invalid-argument', 'Owners cannot revoke their own business access.');
      await verifyOwner(uid, merchantId, merchantType);
      const memberRef = db.doc(`merchant_staff/${merchantId}/members/${staffUid}`), counterRef = db.doc(`merchant_staff/${merchantId}`), targetRef = db.doc(`users/${staffUid}`), ownerRef = db.doc(`users/${uid}`), businessDoc = businessRef(merchantId, merchantType);
      await db.runTransaction(async tx => {
        const [member, target, counter, owner, business] = await Promise.all([tx.get(memberRef), tx.get(targetRef), tx.get(counterRef), tx.get(ownerRef), tx.get(businessDoc)]);
        if (owner.data()?.role !== 'merchant' || owner.data()?.disabled === true || owner.data()?.suspended === true || !business.exists || business.data().ownerId !== uid) throw new HttpsError('permission-denied', 'Only the active verified business owner can manage staff.');
        if (!member.exists) return;
        const profile = target.data(), grant = profile?.merchantStaffAccess?.[merchantId];
        if (grant?.ownerUid === uid) {
          const access = { ...profile.merchantStaffAccess };
          delete access[merchantId];
          if (Object.keys(access).length) tx.update(targetRef, { merchantStaffAccess: access });
          else tx.update(targetRef, { merchantStaffAccess: require('firebase-admin/firestore').FieldValue.delete() });
        }
        tx.delete(memberRef);
        if (member.exists) tx.set(counterRef, { memberCount: Math.max(0, (Number.isSafeInteger(counter.data()?.memberCount) ? counter.data().memberCount : 1) - 1) });
        if (member.exists) tx.create(db.collection('operations_audit').doc(), { operatorId: uid, action: 'merchant_staff_access_revoked', target: `${merchantType}:${merchantId}:${staffUid}`, createdAt: Timestamp.now() });
      });
      return { revoked: true };
    })
  };
}

module.exports = { merchantStaffFunctions };
