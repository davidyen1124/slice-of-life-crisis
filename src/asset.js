// The address of a file in public/, from wherever the page is being served: the root in dev, a sub-path
// on GitHub Pages. (Vite rewrites such addresses in index.html and in CSS, but not in a string.)
export const asset = (file) => import.meta.env.BASE_URL + file
