const stages = Object.freeze({
  pickup: ['conditionRecorded', 'odometerAndFuelChecked', 'personalItemsRemoved', 'loadingSecured'],
  delivery: ['unloadedWithCustomer', 'conditionCompared', 'keysAndItemsReturned', 'handoverCompleted']
});
const { validateTransportPhotos } = require('./transportPhotoPolicy');
const validateInspectionPhotos = photos => validateTransportPhotos(photos, 'condition');

function validateTransportInspection(stage, checklist, notes, cleanText = value => value) {
  const required = stages[stage];
  if (!required || !checklist || typeof checklist !== 'object' || Array.isArray(checklist) || required.some(key => checklist[key] !== true)) throw new Error('Complete every item in the vehicle inspection checklist.');
  const conditionNotes = cleanText(notes, 'Vehicle condition notes', 500);
  if (conditionNotes.length < 3) throw new Error('Record the vehicle condition or note that no visible damage was found.');
  return { checklist: Object.fromEntries(required.map(key => [key, true])), conditionNotes };
}

function requireTransportInspection(stage, inspection) {
  if ((inspection?.inspectionStage || inspection?.stage) !== stage || inspection?.status !== 'recorded' || !inspection?.checklist || !stages[stage]?.every(key => inspection.checklist[key] === true)) throw new Error(`Record the ${stage} vehicle inspection before continuing.`);
}

module.exports = { stages, validateTransportInspection, validateInspectionPhotos, requireTransportInspection };
