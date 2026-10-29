/* global __dirname */ // Expo loads this file with require; apps/mobile's own lint (expo lint) declares no __dirname.
// The runtime version is this project's fingerprint (ADR-IMPL-079). One input depends on the machine, not the code:
// the Firebase file EAS Build hands the build through the GOOGLE_SERVICES_JSON file variable (app.config.ts
// withFirebase), which a GitHub runner does not have. Left in, a runner and EAS would compute two runtimes for one
// commit, and CI would start a native build on every merge. That file alone is left out of the hash, wherever the
// variable puts it; a change to Firebase's file therefore needs a version bump to reach phones as a new build.
// A built-in, not a require(): the repository's lint forbids require-style imports (Node 22 and Bun have it).
const path = process.getBuiltinModule("node:path");

const firebaseFile = process.env.GOOGLE_SERVICES_JSON;

/** @type {import('expo/fingerprint').Config} */
const config = {
  ignorePaths: firebaseFile
    ? [path.relative(__dirname, path.resolve(__dirname, firebaseFile)).split(path.sep).join("/")]
    : [],
};

module.exports = config;
