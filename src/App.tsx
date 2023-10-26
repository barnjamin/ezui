import { MetaMaskSDK, SDKProvider } from "@metamask/sdk";
import {
  ChainAddress,
  SignAndSendSigner,
  TokenTransfer,
  TokenTransferDetails,
  Wormhole,
  WormholeMessageId,
  encoding,
  nativeChainAddress,
  normalizeAmount,
  toChainId
} from "@wormhole-foundation/connect-sdk";
import {
  EvmPlatform,
  evmNetworkChainToEvmChainId,
} from "@wormhole-foundation/connect-sdk-evm";
import { useEffect, useState } from "react";
import "./App.css";
import { MetaMaskSigner } from "./metamask";
import { NETWORK } from "./consts";

function App() {
  const [provider, setProvider] = useState<SDKProvider | null>(null);
  const [signer, setSigner] = useState<SignAndSendSigner | null>(null);
  const [transfer, setTransfer] = useState<TokenTransfer | null>(null);

  const [transferDetails, setTransferDetails] = useState<TokenTransferDetails | null>(null);
  const [srcTxIds, setSrcTxIds] = useState<string[]>([]);
  const [attestations, setAttestations] = useState<WormholeMessageId[]>([]);
  const [dstTxIds, setDstTxIds] = useState<string[]>([]);

  const msk = new MetaMaskSDK();
  const wh = new Wormhole(NETWORK, [EvmPlatform]);

  useEffect(() => {
    if (provider) return;

    (async function () {
      await msk.connect();
      const provider = msk.getProvider();

      const signer = await MetaMaskSigner.fromProvider(provider);
      setSigner(signer);

      provider.on("chainChanged", async () => {
        console.log("Chain changed, updating");
        const signer = await MetaMaskSigner.fromProvider(provider);
        setSigner(signer);
      });

      setProvider(provider);
    })().catch((e) => {
      console.error(e);
    });
  }, [provider]);

  async function start(): Promise<void> {
    if (!signer) throw new Error("No signer");

    // Create a transfer
    const chainCtx = wh.getChain(signer.chain());
    const amt = normalizeAmount("0.01", chainCtx.config.nativeTokenDecimals);
    const snd = nativeChainAddress(signer);
    const rcv = { ...snd, chain: "Ethereum" } as ChainAddress;
    const xfer = await wh.tokenTransfer("native", amt, snd, rcv, false);
    setTransfer(xfer);
    setTransferDetails(xfer.transfer);

    // Start the transfer
    const txids = await xfer.initiateTransfer(signer);
    setSrcTxIds(txids);

    // Wait for attestation to be available
    const att = await xfer.fetchAttestation(60_000);
    setAttestations(att as WormholeMessageId[])
  }

  async function finish(): Promise<void> {
    if (!transfer) throw new Error("No Current transfer");
    if (!provider) throw new Error("No provider");
    if (!signer) throw new Error("No signer");

    // TODO:  get Network from provider? 
    // Lookup the chain id for the network and chain we need 
    // to complete the transfer 
    const eip155ChainId = evmNetworkChainToEvmChainId(
      NETWORK,
      // @ts-ignore
      transfer.transfer.to.chain
    );
    const chainId = encoding.bignum.encode(eip155ChainId, true);
    // Ask the user to switch to this chain
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });

    // Finish transfer with updated signer
    const finalTxs = await transfer.completeTransfer(signer);
    setDstTxIds(finalTxs)
  }

  return (
    <>
      <div className="card">
        <button onClick={start}>Start transfer</button>
      </div>
      <TransferDetailsCard 
        details={transferDetails} 
        attestations={attestations} 
        srcTxIds={srcTxIds} 
        dstTxIds={dstTxIds} 
      />
      <div className="card">
        <button onClick={finish} disabled={attestations.length==0}>
          Complete transfer
        </button>
      </div>
    </>
  );
}


type TransferProps = {
  details: TokenTransferDetails | null
  attestations: WormholeMessageId[]
  srcTxIds: string[]
  dstTxIds: string[]
}

function TransferDetailsCard(props: TransferProps) {
  if(!props.details) return <div className="card"></div>

  const { details, srcTxIds, attestations, dstTxIds } = props;
  const token =
    details.token === "native" ? "Native" : details.token.address.toString();
  return (
    <div className="card">
      <h3>Transfer</h3>
      <p>From: {details.from.address.toString()}</p>
      <p>To: {details.to.address.toString()}</p>
      <p>Token: {token}</p>
      <p>Amount: {details.amount.toString()}</p>
      <hr />
      <h3>Source Transactions</h3>
      <p>
        {srcTxIds.length > 0
          ? srcTxIds.map((t) => `${t}`).join(", ")
          : "None"}
      </p>
      <hr />
      <h3>Attestations</h3>
      <p>
        {attestations.length > 0
          ? attestations 
              .map(
                (att) =>
                  `${toChainId(att.chain)}/${encoding.stripPrefix("0x", att.emitter.toString())}/${att.sequence}`
              )
              .join(", ")
          : "None"}
      </p>
      <h3>Destination Transactions</h3>
      <p>
        {dstTxIds.length > 0
          ? dstTxIds.map((t) => `${t}`).join(", ")
          : "None"}
      </p>
      <hr />
    </div>
  );
}

export default App;
