// The type of the set of fonts of a document in the type library of this project has neither add nor delete, which the browser has.
// They are declared here, so that the code needs no cast; a newer type library already holds them and the two declarations merge.
interface FontFaceSet {
  add(font: FontFace): FontFaceSet;
  delete(font: FontFace): boolean;
}
