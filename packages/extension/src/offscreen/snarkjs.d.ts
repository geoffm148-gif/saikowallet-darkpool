declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: Uint8Array | string,
      zkeyFile: Uint8Array | string,
    ): Promise<{ proof: any; publicSignals: string[] }>;
    verify(
      vk: any,
      publicSignals: string[],
      proof: any,
    ): Promise<boolean>;
  };
}
