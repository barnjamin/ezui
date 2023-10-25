import { MetaMaskSDK, SDKProvider } from "@metamask/sdk";
import { useState, useEffect } from "react";
import "./App.css";
import {
  ChainAddress,
  ChainName,
  Network,
  SignAndSendSigner,
  UnsignedTransaction,
  Wormhole,
  nativeChainAddress,
  normalizeAmount,
} from "@wormhole-foundation/connect-sdk";
import {
  EvmPlatform,
  evmChainIdToNetworkChainPair,
} from "@wormhole-foundation/connect-sdk-evm";

class MetaMaskSigner implements SignAndSendSigner {
  private constructor(
    private provider: SDKProvider,
    private _address: string,
    private network: Network,
    private _chain: ChainName
  ) {}

  chain(): ChainName {
    return this._chain;
  }
  address(): string {
    return this._address;
  }

  async signAndSend(txs: UnsignedTransaction[]): Promise<string[]> {
    console.log("Got transactions: ", txs);
    const txids: string[] = [];
    console.log("OK", await this.provider.request<string[]>({
      method: "eth_requestAccounts",
      params: [],
    }));
    for (const txn of txs) {
      const tx = {
        ...txn.transaction, 
        value: "0x"+BigInt(txn.transaction.value).toString(16),
        chainId: "0x"+BigInt(txn.transaction.chainId).toString(16)
      }

      const req = {
        method: "eth_sendTransaction",
        params: [tx],
      }
      console.log("Sending a request", req);
      const txid = await this.provider.request<string>(req);
      console.log(txid);
      if (!txid) throw new Error("Could not sign transaction");
      txids.push(txid);
    }
    return txids;
  }

  static async fromProvider(provider: SDKProvider) {
    const acctResp = await provider.request<string[]>({
      method: "eth_requestAccounts",
      params: [],
    });
    if (acctResp === null || acctResp === undefined || acctResp.length === 0)
      throw new Error("Could not retrieve accounts");

    const chainResp = await provider.request<string>({
      method: "eth_chainId",
      params: [],
    });
    if (!chainResp) throw new Error("Could not retrieve chain id");

    const eip155ChainId = BigInt(chainResp as string);
    if (!evmChainIdToNetworkChainPair.has(eip155ChainId))
      throw new Error("Unsupported chain");

    const [network, chain] = evmChainIdToNetworkChainPair.get(eip155ChainId)!;
    return new MetaMaskSigner(provider, acctResp[0]!, network, chain);
  }
}

function App() {
  const [provider, setProvider] = useState<SDKProvider | null>(null);
  const [signer, setSigner] = useState<SignAndSendSigner | null>(null);

  const msk = new MetaMaskSDK({
    enableDebug: true,
    dappMetadata: {
      name: "Wormhole Testnet",
      url: "https://wormhole.com",
    },
    logging: {
      developerMode: true,
      sdk: true,
    },
  });
  const wh = new Wormhole("Testnet", [EvmPlatform]);

  useEffect(() => {
    if (provider) return;

    const connectAndGetProvider = async function () {
      await msk.connect();
      const provider = msk.getProvider();
      MetaMaskSigner.fromProvider(provider).then((signer) => {
        setSigner(signer);
      });
      setProvider(provider);
    };
    connectAndGetProvider().catch((e) => {
      console.error(e);
    });
  }, [provider]);

  const doit = function () {
    console.log("do it");
    if (!signer) return;
    console.log(signer);
    const chainCtx = wh.getChain(signer.chain());
    const amt = normalizeAmount("0.01", chainCtx.config.nativeTokenDecimals);
    const snd = nativeChainAddress(signer);
    const rcv = { ...snd, chain: "Ethereum" } as ChainAddress;

    console.log(snd, rcv, amt);

    async function doinIt() {
      const xfer = await wh.tokenTransfer("native", amt, snd, rcv, false);
      console.log(xfer);
      const txids = await xfer.initiateTransfer(signer!);
      console.log(txids);
      const att = await xfer.fetchAttestation(60_000);
      console.log(att);
    }

    doinIt()
      .then((x) => {
        console.log(x);
      })
      .catch((e) => {
        console.error(e);
      });
  };

  return (
    <>
      <div className="card">
        <button onClick={doit}>Do it</button>
      </div>
    </>
  );
}

export default App;
