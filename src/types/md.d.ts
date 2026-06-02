// Allow importing Markdown files as raw text strings (esbuild `text` loader).
declare module '*.md' {
    const content: string;
    export default content;
}
