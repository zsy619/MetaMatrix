declare module 'mammoth/mammoth.browser.js' {
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: { convertImage?: unknown },
  ): Promise<{ value: string }>
  export const images: {
    imgElement: (
      fn: (image: {
        contentType: string
        read: (encoding: 'base64') => Promise<string>
      }) => Promise<{ src: string }>,
    ) => unknown
  }
}
