// Only these reviewed originals and superseded candidates are excluded.
// Files remain untouched in public; no glob-based unused-file deletion.
export const excludedPublicMedia = [
  ...[
    "cover-01.png", "cover-02.jpg", "cover-03.png", "cover-04.png", "cover-05.png",
    "cover-06.jpg", "cover-07.jpg", "cover-08.jpg", "cover-09.png", "cover-10.jpg"
  ].map(name => `blog-covers/${name}`),
];
