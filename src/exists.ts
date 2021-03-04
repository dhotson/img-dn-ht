import fs from "fs";
import { access } from "fs/promises";

export default async function exists(path: string): Promise<void> {
  try {
    access(path, fs.constants.F_OK | fs.constants.R_OK);
  } catch (err) {
    raise err;
  }
}
