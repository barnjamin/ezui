import { MetaMaskSDK, SDKProvider } from "@metamask/sdk";
import { useEffect, useState } from "react";

import {
  Chain,
  ChainAddress,
  Network,
  SignAndSendSigner,
  TokenTransfer,
  TokenTransferDetails,
  Wormhole,
  WormholeMessageId,
  amount,
  encoding,
  isNative,
  toChainId,
  wormhole
} from "@wormhole-foundation/sdk";
import algorand from "@wormhole-foundation/sdk/algorand";
import aptos from "@wormhole-foundation/sdk/aptos";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import sui from "@wormhole-foundation/sdk/sui";

import "./App.css";
import { NETWORK } from "./consts.js";
import { MetaMaskSigner } from "./metamask.ts";
import { PhantomProvider, PhantomSigner } from "./phantom.ts";

const msk = new MetaMaskSDK();
function App() {
  const [evmProvider, setEvmProvider] = useState<SDKProvider | null>(null);
  const [evmSigner, setEvmSigner] = useState<SignAndSendSigner<
    Network,
    Chain
  > | null>(null);
  const [phantomProvider, setPhantomProvider] =
    useState<PhantomProvider | null>(null);
  const [solSigner, setSolSigner] = useState<SignAndSendSigner<
    Network,
    Chain
  > | null>(null);

  // This determines which signer to use
  const [currentChain, setCurrentChain] = useState<string | null>("Solana");
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);

  // The actual signer, implemented elsewhere
  // const [signer, setSigner] = useState<SignAndSendSigner<
  //   Network,
  //   Chain
  // > | null>(null);

  const [transfer, setTransfer] = useState<TokenTransfer | null>(null);
  const [transferDetails, setTransferDetails] =
    useState<TokenTransferDetails | null>(null);
  const [srcTxIds, setSrcTxIds] = useState<string[]>([]);
  const [attestations, setAttestations] = useState<WormholeMessageId[]>([]);
  const [dstTxIds, setDstTxIds] = useState<string[]>([]);
  const [wh, setWormhole] = useState<Wormhole<Network> | null>(null);

  //function updateSignerDataFromProvider(
  //  signer: SignAndSendSigner<Network, Chain>
  //) {
  //  setCurrentAddress(signer.address());
  //  setCurrentChain(signer.chain());
  //  //setSigner(signer);
  //}

  useEffect(() => {
    if (wh) return;
    wormhole(NETWORK, [evm, solana, algorand, aptos, sui]).then((wh) => {
      setWormhole(wh);
    });
  });

  // Effect for phantom/solana
  useEffect(() => {
    if (phantomProvider) return;
    if (!("phantom" in window)) return;
    if (!wh) return;


    (async function () {
      // @ts-ignore
      const provider = window.phantom!.solana as PhantomProvider;
      if (!provider?.isPhantom) return;

      await provider.connect();
      await PhantomSigner.fromProvider(wh!, provider).then((signer) => {
        setSolSigner(signer);
      });
      setPhantomProvider(provider);
    })().catch((e) => {
      console.error(e);
    });
  }, [phantomProvider, wh]);

  // Effect for metamask/evm
  useEffect(() => {
    if (evmProvider) return;

    (async function () {
      await msk.connect();
      const provider = msk.getProvider();
      await MetaMaskSigner.fromProvider(provider).then((signer) => {
        setEvmSigner(signer);
      });
      setEvmProvider(provider);
    })().catch((e) => {
      console.error(e);
    });
  }, [evmProvider, wh]);

  async function start(): Promise<void> {
    if (!solSigner) throw new Error("No signer");
    if (!wh) throw new Error("No wormhole");



    // Create a transfer
    const chainCtx = wh.getChain(solSigner.chain());
    const amt = amount.parse("0.01", chainCtx.config.nativeTokenDecimals);
    const snd = Wormhole.chainAddress(solSigner.chain(), solSigner.address());
    const tkn = Wormhole.tokenId(chainCtx.chain, "native");

    let rcv: ChainAddress;
    if (currentChain !== "Solana") {
      rcv = Wormhole.chainAddress(
        "Solana",
        phantomProvider!.publicKey!.toBase58()
      );
    } else {
      rcv = { ...snd, chain: "Sepolia" };
    }

    const xfer = await wh.tokenTransfer(
      tkn,
      amount.units(amt),
      snd,
      rcv,
      false
    );
    setTransfer(xfer);
    setTransferDetails(xfer.transfer);

    // Start the transfer
    const txids = await xfer.initiateTransfer(solSigner);
    setSrcTxIds(txids);

    // Wait for attestation to be available
    const att = await xfer.fetchAttestation(60_000);
    setAttestations(att as WormholeMessageId[]);
  }

  async function finish(): Promise<void> {
    if (!transfer) throw new Error("No Current transfer");
    if (!evmSigner) throw new Error("No signer");

    // Lookup the chain id for the network and chain we need
    // to complete the transfer
    //const eip155ChainId = nativeChainIds.networkChainToNativeChainId.get(
    //  NETWORK,
    //  transfer.transfer.to.chain
    //) as bigint;
    // Ask wallet to prompt the user to switch to this chain
    //const chainId = encoding.bignum.encode(eip155ChainId, true);
    //await evmProvider.request({
    //  method: "wallet_switchEthereumChain",
    //  params: [{ chainId }],
    //});

    // Finish transfer with updated signer
    const finalTxs = await transfer.completeTransfer(evmSigner);
    setDstTxIds(finalTxs);
  }

  return (
    <>
      <div className="card">
        <p>
          <b>Connected?:</b>{" "}
          {evmProvider !== null && phantomProvider !== null ? "Yes" : "No"}
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
  const token = isNative(details.token.address)
    ? "Native"
    : details.token.address.toString();

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
