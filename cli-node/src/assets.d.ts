/** Text files imported with `with { type: "text" }` (bundled into atlas.js). */
declare module "*.md" {
  const text: string;
  export default text;
}
