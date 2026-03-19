import * as fs from "fs";
import * as path from "path";

// solc is loaded dynamically so the module is resolved at runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
function loadSolc(): any {
  try {
    return require("solc");
  } catch {
    throw new Error("solc package is not installed. Run: npm install --save-dev solc");
  }
}

export interface CompileResult {
  abi: any[];
  bytecode: string;
}

/**
 * Compile a Solidity source file and return ABI + bytecode for the given contract.
 *
 * @param soliditySource - Raw Solidity source code
 * @param contractName   - Name of the contract to extract (e.g. "VaultAlertLog")
 */
export function compileSolidity(
  soliditySource: string,
  contractName: string,
): CompileResult {
  const solc = loadSolc();

  const input = {
    language: "Solidity",
    sources: {
      [`${contractName}.sol`]: { content: soliditySource },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const serious = output.errors.filter((e: any) => e.severity === "error");
    if (serious.length > 0) {
      const msgs = serious.map((e: any) => e.formattedMessage).join("\n");
      throw new Error(`Solidity compilation errors:\n${msgs}`);
    }
  }

  const contractFile = `${contractName}.sol`;
  const contracts = output.contracts?.[contractFile];
  if (!contracts || !contracts[contractName]) {
    throw new Error(`Contract "${contractName}" not found in compilation output`);
  }

  const compiled = contracts[contractName];
  return {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
  };
}

/**
 * Compile VaultAlertLog.sol and write artifacts to artifacts/ directory.
 * Intended to be called as a CLI script via `tsx src/compile.ts`.
 */
export function compileVaultAlertLog(
  rootDir: string = path.resolve(__dirname, ".."),
): CompileResult {
  const solPath = path.join(rootDir, "contracts", "VaultAlertLog.sol");
  if (!fs.existsSync(solPath)) {
    throw new Error(`Solidity source not found: ${solPath}`);
  }
  const source = fs.readFileSync(solPath, "utf-8");
  const result = compileSolidity(source, "VaultAlertLog");

  const artifactsDir = path.join(rootDir, "artifacts");
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(artifactsDir, "VaultAlertLog.json"),
    JSON.stringify({ abi: result.abi, bytecode: result.bytecode }, null, 2),
  );

  return result;
}

// CLI entry point
if (require.main === module) {
  try {
    const result = compileVaultAlertLog();
    console.log(`Compiled VaultAlertLog: ABI has ${result.abi.length} entries, bytecode ${result.bytecode.length} chars`);
  } catch (err: any) {
    console.error("Compilation failed:", err.message);
    process.exit(1);
  }
}
