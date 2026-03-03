declare module 'pg' {
  export const types: {
    setTypeParser(
      oid: number,
      parser: (value: string) => Date,
    ): void;
  };
}
