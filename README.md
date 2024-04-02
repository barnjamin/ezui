Connect SDK Web Wallet Demo
---------------------------

This demo should serve as an example of how a web wallet can be wrapped to provide one of the `Signer` interfaces required by the [Connect SDK](https://github.com/wormhole-foundation/connect-sdk).

See the [MetaMaskSigner](src/metamask.ts) for an example of a `SignAndSendSigner`


:warning: This demo is not very user friendly (no ability to change transfer params in UI) nor pretty (I'm bad at this). :warning:

## Try it

```sh
git clone https://github.com/barnjamin/ezui.git 
cd ezui
npm install
npm run dev
```

0) Connect metamask/phantom when prompted 

    > Note: This example uses Testnet by default, update the const to change this 

1) Click `Start Transfer` and sign the transaction when prompted
2) Wait for the transfer to be mined and the VAA to be available
3) Click `Complete Transfer` and approve the network change then sign the transaction when prompted


## Going Further

Add more web wallet wrapper options
Allow modification of transfer parameters
Add other routes (CCTP/Gateway/...)
