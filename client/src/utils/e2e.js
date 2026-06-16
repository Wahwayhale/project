const ALGO = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

export async function generateKeyPair() {
  const kp = await window.crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
  const pub = await window.crypto.subtle.exportKey('spki', kp.publicKey);
  const priv = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey);
  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(pub))),
    privateKeyBase64: btoa(String.fromCharCode(...new Uint8Array(priv))),
    rawPublic: kp.publicKey,
    rawPrivate: kp.privateKey
  };
}

export async function importPublicKey(base64) {
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey('spki', binary, ALGO, true, ['encrypt']);
}

export async function importPrivateKey(base64) {
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey('pkcs8', binary, ALGO, true, ['decrypt']);
}

export async function encryptMessage(text, publicKey) {
  const encoded = new TextEncoder().encode(text);
  const encrypted = await window.crypto.subtle.encrypt(ALGO, publicKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

export async function decryptMessage(cipherBase64, privateKey) {
  const binary = Uint8Array.from(atob(cipherBase64), c => c.charCodeAt(0));
  const decrypted = await window.crypto.subtle.decrypt(ALGO, privateKey, binary);
  return new TextDecoder().decode(decrypted);
}
