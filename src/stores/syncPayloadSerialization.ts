export function arrayBufferToBase64(data: ArrayBuffer): string {
    const bytes = new Uint8Array(data)
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize)
        binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    let binary: string
    try {
        binary = atob(base64)
    } catch {
        return new ArrayBuffer(0)
    }
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes.buffer
}

export function getArrayLength(value: unknown): number {
    return Array.isArray(value) ? value.length : 0
}
