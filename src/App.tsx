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
  toChainId,
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

  const [transferDetails, setTransferDetails] =
    useState<TokenTransferDetails | null>(null);
  const [srcTxIds, setSrcTxIds] = useState<string[]>([]);
  const [attestations, setAttestations] = useState<WormholeMessageId[]>([]);
  const [dstTxIds, setDstTxIds] = useState<string[]>([]);

  const [currentChain, setCurrentChain] = useState<string | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);

  const msk = new MetaMaskSDK();
  const wh = new Wormhole(NETWORK, [EvmPlatform]);

  function updateSignerFromProvider(provider: SDKProvider) {
    MetaMaskSigner.fromProvider(provider)
      .then((signer) => {
        setCurrentAddress(signer.address());
        setCurrentChain(signer.chain());
        setSigner(signer);
      })
      .catch((e) => {
        console.error(e);
        setCurrentAddress(null);
        setCurrentChain(null);
        setSigner(null);
      });
  }

  useEffect(() => {
    if (provider) return;

    (async function () {
      await msk.connect();
      const provider = msk.getProvider();

      updateSignerFromProvider(provider);
      provider.on("chainChanged", () => {
        updateSignerFromProvider(provider);
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
    setAttestations(att as WormholeMessageId[]);
  }

  async function finish(): Promise<void> {
    if (!transfer) throw new Error("No Current transfer");
    if (!provider) throw new Error("No provider");
    if (!signer) throw new Error("No signer");

    // Lookup the chain id for the network and chain we need
    // to complete the transfer
    const eip155ChainId = evmNetworkChainToEvmChainId(
      NETWORK,
      // @ts-ignore
      transfer.transfer.to.chain
    );

    // Ask wallet to prompt the user to switch to this chain
    const chainId = encoding.bignum.encode(eip155ChainId, true);
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });

    // Finish transfer with updated signer
    const finalTxs = await transfer.completeTransfer(signer);
    setDstTxIds(finalTxs);
  }

  return (
    <>
      <div className="card">
        <p>
          <b>Connected to Metamask?:</b>{" "}
          {currentChain !== null
            ? "Yes"
            : "No (make sure you have a Testnet network selected)"}
        </p>
        <p>
          {currentChain}: {currentAddress}
        </p>
      </div>
      <div className="card">
        <button onClick={start} disabled={srcTxIds.length > 0}>
          Start transfer
        </button>
      </div>
      <TransferDetailsCard
        details={transferDetails}
        attestations={attestations}
        srcTxIds={srcTxIds}
        dstTxIds={dstTxIds}
      />
      <div className="card">
        <button onClick={finish} disabled={attestations.length == 0}>
          Complete transfer
        </button>
      </div>
    </>
  );
}

type TransferProps = {
  details: TokenTransferDetails | null;
  attestations: WormholeMessageId[];
  srcTxIds: string[];
  dstTxIds: string[];
};

function TransferDetailsCard(props: TransferProps) {
  if (!props.details)
    return (
      <div className="card">
        <p>
          Click <b>Start Transfer</b> to initiate the transfer
        </p>
      </div>
    );

  const { details, srcTxIds, attestations, dstTxIds } = props;
  const token =
    details.token === "native" ? "Native" : details.token.address.toString();

  return (
    <div className="card">
      <h3>Transfer</h3>
      <p>
        From: {details.from.chain} : {details.from.address.toString()}
      </p>
      <p>
        To: {details.to.chain} : {details.to.address.toString()}
      </p>
      <p>Token: {token}</p>
      <p>Amount: {details.amount.toString()}</p>
      <hr />
      <h3>Source Transactions</h3>
      <p>
        {srcTxIds.length > 0 ? srcTxIds.map((t) => `${t}`).join(", ") : "None"}
      </p>
      <hr />
      <h3>Attestations</h3>
      <p>
        {attestations.length > 0
          ? attestations
              .map((att) => {
                const whChainId = toChainId(att.chain);
                const emitter = encoding.stripPrefix(
                  "0x",
                  att.emitter.toString()
                );
                return `${whChainId}/${emitter}/${att.sequence}`;
              })
              .join(", ")
          : "None"}
      </p>
      <h3>Destination Transactions</h3>
      <p>
        {dstTxIds.length > 0 ? dstTxIds.map((t) => `${t}`).join(", ") : "None"}
      </p>
      <hr />
    </div>
  );
}

export default App;
