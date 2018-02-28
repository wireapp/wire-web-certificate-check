const argv = require('yargs')
  .option('url', {
    alias: 'url',
    default: 'https://app.wire.com'
  })
  .argv;
const crypto = require('crypto');
const https = require('https');
const rs = require('jsrsasign');

function getDERFormattedCertificate(url) {
  return new Promise((resolve, reject) => {
    try {
      const request = https.get(url, () => {
        resolve(request.socket.getPeerCertificate(true).raw);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function getFingerprint(derCert) {
  const derString = derCert.toString('binary');
  const hexDerFileContents = rs.rstrtohex(derString);
  const pemString = rs.KJUR.asn1.ASN1Util.getPEMStringFromHex(hexDerFileContents, 'CERTIFICATE');
  const publicKey = rs.X509.getPublicKeyInfoPropOfCertPEM(pemString);
  const publicKeyBytes = Buffer.from(publicKey.keyhex, 'hex').toString('binary');
  return crypto.createHash('sha256').update(publicKeyBytes).digest('base64');
}

(async () => {
  const derCert = await getDERFormattedCertificate(argv.url);
  const publicKeyFingerprint = await getFingerprint(derCert);
  console.log(`Certificate fingerprint for "${argv.url}": "${publicKeyFingerprint}"`);
})();




