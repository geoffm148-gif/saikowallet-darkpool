// Stub for Node.js built-in modules that shouldn't be used in browser/extension context
export default {};
export const readFileSync = () => { throw new Error('fs not available in extension'); };
export const existsSync = () => false;
export const writeFileSync = () => {};
export const join = (...args: string[]) => args.join('/');
export const resolve = (...args: string[]) => args.join('/');
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/');
export const basename = (p: string) => p.split('/').pop() ?? '';
export const extname = (p: string) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
