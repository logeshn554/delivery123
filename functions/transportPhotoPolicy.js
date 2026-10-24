const MAX_TRANSPORT_PHOTO_BYTES = 300 * 1024;

function validateTransportPhotos(photos, label = 'vehicle') {
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 2) throw new Error(`Attach one or two ${label} photos.`);
  return photos.map(photo => {
    if (!photo || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.contentType) || typeof photo.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(photo.base64)) throw new Error(`Use a valid JPEG, PNG or WebP ${label} photo.`);
    const bytes = Buffer.from(photo.base64, 'base64');
    if (!bytes.length || bytes.length > MAX_TRANSPORT_PHOTO_BYTES) throw new Error(`Each ${label} photo must be 300 KB or smaller.`);
    const valid = photo.contentType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9 : photo.contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid) throw new Error(`The ${label} photo file does not match its image format.`);
    return { contentType: photo.contentType, base64: photo.base64 };
  });
}

module.exports = { MAX_TRANSPORT_PHOTO_BYTES, validateTransportPhotos };
