import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  type InterfaceAbi,
} from "ethers";
import type {
  ChainSource,
  ChainBlock,
  ChainLog,
} from "../../../indexer/src/indexer.js";
export type Manifest = {
  chainId: number;
  contracts: Record<string, string>;
  investors: { wallet: string; label: string }[];
  deployedAt: number;
};
export async function artifact(name: string) {
  return JSON.parse(
    await readFile(
      resolve("contracts/out", `${name}.sol`, `${name}.json`),
      "utf8",
    ),
  ) as { abi: InterfaceAbi; bytecode: { object: string } };
}
export async function loadManifest(): Promise<Manifest> {
  return JSON.parse(
    await readFile("examples/corporate-bond/deployment.json", "utf8"),
  );
}
export async function connect(manifest: Manifest) {
  const provider = new JsonRpcProvider(
    process.env.RPC_URL ?? "http://127.0.0.1:8545",
  );
  if (
    Number((await provider.getNetwork()).chainId) !== manifest.chainId ||
    manifest.chainId !== 31337
  )
    throw new Error("Local chain 31337 required");
  const contracts: Record<string, Contract> = {};
  for (const [name, address] of Object.entries(manifest.contracts))
    contracts[name] = new Contract(
      address,
      (await artifact(name)).abi,
      provider,
    );
  const source: ChainSource = {
    head: () => provider.getBlockNumber(),
    async block(number): Promise<ChainBlock> {
      const block = await provider.getBlock(number);
      if (!block?.hash) throw new Error("Missing block");
      const logs = await provider.getLogs({
        fromBlock: number,
        toBlock: number,
        address: Object.values(manifest.contracts),
      });
      const decoded: ChainLog[] = [];
      for (const log of logs) {
        const contract = Object.values(contracts).find(
          (c) => String(c.target).toLowerCase() === log.address.toLowerCase(),
        );
        const event = contract?.interface.parseLog(log);
        if (!event) continue;
        const args: Record<string, unknown> = {};
        event.fragment.inputs.forEach((input, i) => {
          args[input.name] = event.args[i];
        });
        decoded.push({
          transactionHash: log.transactionHash,
          index: log.index,
          address: log.address,
          name: event.name,
          args: JSON.parse(
            JSON.stringify(args, (_, v) =>
              typeof v === "bigint" ? v.toString() : v,
            ),
          ),
        });
      }
      return {
        number,
        hash: block.hash,
        parentHash: block.parentHash,
        logs: decoded,
      };
    },
  };
  return { provider, contracts, source };
}
export interface CustodyAdapter {
  authorize(transaction: {
    to: string;
    data: string;
    chainId: number;
  }): Promise<{ approvalId: string }>;
  sign(approvalId: string): Promise<string>;
  broadcast(signedTransaction: string): Promise<string>;
}
