// Tirage au hasard utilisable par les fichiers de rôles, côté serveur comme côté navigateur.
export function randomInt(max) {
  const valeurs = new Uint32Array(1);
  globalThis.crypto.getRandomValues(valeurs);
  return valeurs[0] % max;
}
