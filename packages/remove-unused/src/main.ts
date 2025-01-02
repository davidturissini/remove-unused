type Params = {
  cwd: string;
}

export async function analyze({ cwd }: Params) {
  return {
    unusedFiles: [],
  }
}