// Stub loader for .onnx files — prevents Turbopack from failing on
// binary ONNX model files that it cannot natively handle.
// The actual .onnx files are loaded at runtime via fs.readFileSync,
// so the bundled value is never used.
module.exports = function () {
  return 'module.exports = "";';
};
