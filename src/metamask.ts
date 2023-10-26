import { SDKProvider } from "@metamask/sdk";
import {
    ChainName,
    SignAndSendSigner,
    UnsignedTransaction,
    encoding,
} from "@wormhole-foundation/connect-sdk";
import {
    EvmPlatform,
} from "@wormhole-foundation/connect-sdk-evm";
import "./App.css";
import { NETWORK } from "./consts";


export class MetaMaskSigner implements SignAndSendSigner {
    private constructor(
        private provider: SDKProvider,
        private _address: string,
        private _chain: ChainName
    ) { }

    static async fromProvider(provider: SDKProvider) {
        const acctResp = await provider.request<string[]>({
            method: "eth_requestAccounts", params: [],
        });
        if (!acctResp || acctResp.length === 0)
            throw new Error("Could not retrieve accounts");

        const chainResp = await provider.request<string>({
            method: "eth_chainId", params: [],
        });
        if (!chainResp) throw new Error("Could not retrieve chain id");

        const [network, chain] = EvmPlatform.chainFromChainId(chainResp)

        if (network !== NETWORK) throw new Error(`Invalid network, expected: ${NETWORK} got ${network}`)

        return new MetaMaskSigner(provider, acctResp[0]!, chain);
    }

    chain(): ChainName {
        return this._chain;
    }
    address(): string {
        return this._address;
    }

    async signAndSend(txs: UnsignedTransaction[]): Promise<string[]> {
        const txids: string[] = [];

        for (const txn of txs) {
            const { description, transaction } = txn
            console.log(`Signing ${description}`)

            // Note: metamask wants these as hex strings instead of bignums
            if ("value" in transaction && typeof transaction.value === "bigint")
                transaction.value = encoding.bignum.encode(transaction.value, true)

            if ("chainId" in transaction && typeof transaction.chainId === "bigint")
                transaction.chainId = encoding.bignum.encode(transaction.chainId, true)

            const txid = await this.provider.request<string>({
                method: "eth_sendTransaction",
                params: [transaction],
            });

            if (!txid) throw new Error("Could not determine if transaction was sign and sent");

            txids.push(txid);
        }

        return txids;
    }

}