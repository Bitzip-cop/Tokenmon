// electron-vite 的 `?asset` 导入(把文件拷到 out 并返回运行时路径)。
declare module '*?asset' {
  const src: string;
  export default src;
}
