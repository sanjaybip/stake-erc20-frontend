import { useEffect, useState } from "react";

import { ethers } from "ethers";

import "./App.css";

import {
  CONTRACT_ADDRESS,
  LINK_ADDRESS,
  USDT_ADDRESS,
  USDC_ADDRESS,
  WBTC_ADDRESS,
  WETH_ADDRESS,
  artifact,
  linkArtifact,
  usdtArtifact,
  usdcArtifact,
  wbtcArtifact,
  wethArtifact,
} from "./constants.js";

import StakeModal from "./components/StakeModal";

function App() {
  const [provider, setProvider] = useState(undefined);

  const [signer, setSigner] = useState(undefined);

  const [contract, setContract] = useState(undefined);

  const toEther = (wei) =>
    Number(ethers.utils.formatEther(String(wei))).toFixed(2);

  const [tokenSymbols, setTokenSymbols] = useState([]);

  const [tokens, setTokens] = useState({});

  const [stakedTokens, setStakedTokens] = useState({});

  const [assetIds, setAssetIds] = useState([]);
  const [assets, setAssets] = useState([]);

  const [showStakeModal, setShowStakeModal] = useState(false);

  const [stakeTokenSymbol, setStakeTokenSymbol] = useState(undefined);

  const [stakeTokenQuantity, setStakeTokenQuantity] = useState(undefined);

  const [tokenContracts, setTokenContracts] = useState({});

  useEffect(() => {
    const onLoad = async () => {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(provider);

      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        artifact.abi,
        provider
      );
      setContract(contract);

      const linkContract = new ethers.Contract(
        LINK_ADDRESS,
        linkArtifact.abi,
        provider
      );
      const usdtContract = new ethers.Contract(
        USDT_ADDRESS,
        usdtArtifact.abi,
        provider
      );
      const usdcContract = new ethers.Contract(
        USDC_ADDRESS,
        usdcArtifact.abi,
        provider
      );
      const wbtcContract = new ethers.Contract(
        WBTC_ADDRESS,
        wbtcArtifact.abi,
        provider
      );
      const wethContract = new ethers.Contract(
        WETH_ADDRESS,
        wethArtifact.abi,
        provider
      );
      setTokenContracts((prev) => ({ ...prev, ["LINK"]: linkContract }));
      setTokenContracts((prev) => ({ ...prev, ["USDT"]: usdtContract }));
      setTokenContracts((prev) => ({ ...prev, ["USDC"]: usdcContract }));
      setTokenContracts((prev) => ({ ...prev, ["WBTC"]: wbtcContract }));
      setTokenContracts((prev) => ({ ...prev, ["WETH"]: wethContract }));

      const tokenSymbols = await contract.getTokenSymbols();
      setTokenSymbols(tokenSymbols);

      tokenSymbols.map(async (symbol) => {
        const token = await contract.getToken(symbol);
        setTokens((prev) => ({ ...prev, [symbol]: token }));

        const stakedAmount = await contract.stakedTokens(symbol);
        setStakedTokens((prev) => ({
          ...prev,
          [symbol]: toEther(stakedAmount),
        }));
      });
    };
    onLoad();
  }, []);

  const isConnected = () => signer !== undefined;

  const getSigner = async () => {
    const signer = provider.getSigner();
    setSigner(signer);
    return signer;
  };

  const connectAndLoad = async () => {
    const signer = await getSigner(provider);
    setSigner(signer);

    const assetIdsHex = await contract
      .connect(signer)
      .getPositionIdsForAddress();
    const assetIds = assetIdsHex.map((id) => Number(id));
    setAssetIds(assetIds);

    const queriedAssets = await Promise.all(
      assetIds.map((id) => contract.connect(signer).getPositionById(Number(id)))
    );

    queriedAssets.map(async (asset) => {
      const tokensStaked = toEther(asset.tokenQuantity);

      const ethAccruedInterestWei = await calcAccruedInterest(
        asset.apy,
        asset.ethValue,
        asset.createdDate
      );

      const ethAccruedInterest = toEther(ethAccruedInterestWei);

      const usdAccruedInterest = (
        (ethAccruedInterest * tokens["WETH"].usdPrice) /
        100
      ).toFixed(2);

      const parsedAsset = {
        positionId: Number(asset.positionId),
        tokenName: asset.name,
        tokenSymbol: asset.symbol,
        createdDate: asset.createdDate,
        apy: asset.apy / 100,
        tokensStaked: tokensStaked,
        usdValue: toEther(asset.usdValue) / 100,
        usdAccruedInterest: usdAccruedInterest,
        ethAccruedInterest: ethAccruedInterest,
        open: asset.open,
      };

      setAssets((prev) => [...prev, parsedAsset]);
    });
  };

  const calcAccruedInterest = async (apy, value, createdDate) => {
    const numberOfDays = await contract.calculateNumberDays(createdDate);
    const accruedInterest = await contract.calculateInterest(
      apy,
      value,
      numberOfDays
    );
    return Number(accruedInterest);
  };

  const openStakingModal = (tokenSymbol) => {
    setShowStakeModal(true);
    setStakeTokenSymbol(tokenSymbol);
  };

  const stakeTokens = async () => {
    const stakeTokenQuantityWei = ethers.utils.parseEther(stakeTokenQuantity);
    await tokenContracts[stakeTokenSymbol]
      .connect(signer)
      .approve(contract.address, stakeTokenQuantityWei);
    contract
      .connect(signer)
      .stakeToken(stakeTokenSymbol, stakeTokenQuantityWei);
  };

  const withdraw = (positionId) => {
    contract.connect(signer).closePosition(positionId);
  };

  const tokenRow = (tokenSymbol) => {
    const token = tokens[tokenSymbol];
    const amountStaked = Number(stakedTokens[tokenSymbol]);

    return (
      <div className="row">
        <div className="col-md-2">{displayLogo(token?.symbol)}</div>
        <div className="col-md-2">{token?.symbol}</div>
        <div className="col-md-2">
          {(Number(token?.usdPrice) / 100).toFixed(0)}
        </div>
        <div className="col-md-2">{amountStaked}</div>
        <div className="col-md-2">{(Number(token?.apy) / 100).toFixed(0)}%</div>
        <div className="col-md-2">
          {isConnected() && (
            <div
              className="orangeMiniButton"
              onClick={() => openStakingModal(tokenSymbol, "12%")}
            >
              Stake
            </div>
          )}
        </div>
      </div>
    );
  };

  const displayLogo = (symbol) => {
    if (symbol === "LINK") {
      return (
        <>
          <img className="logoImg" src="link-logo.png" />
        </>
      );
    } else if (symbol === "USDT") {
      return (
        <>
          <img className="logoImg" src="usdt-logo.png" />
        </>
      );
    } else if (symbol === "USDC") {
      return (
        <>
          <img className="logoImg" src="usdc-logo.png" />
        </>
      );
    } else if (symbol === "WBTC") {
      return (
        <>
          <img className="logoImg" src="wbtc-logo.png" />
        </>
      );
    } else if (symbol === "WETH") {
      return (
        <>
          <img className="logoImg" src="weth-logo.png" />
        </>
      );
    }
  };

  return (
    <div className="App">
      <div className="marketContainer">
        <div className="subContainer">
          <span>
            <img className="logoImg" src="weth-logo.png" />
          </span>
          <span className="marketHeader">Ethereum Market</span>
        </div>

        <div>
          <div className="row columnHeaders">
            <div className="col-md-2">Asset</div>
            <div className="col-md-2">Symbol</div>
            <div className="col-md-2">Price (USD)</div>
            <div className="col-md-2">Total Supplied</div>
            <div className="col-md-2">APY</div>
            <div className="col-md-2"></div>
          </div>
        </div>
        <div>
          {tokenSymbols.length > 0 &&
            Object.keys(tokens).length > 0 &&
            tokenSymbols.map((a, idx) => <div>{tokenRow(a)}</div>)}
        </div>
      </div>

      <div className="assetContainer">
        {isConnected() ? (
          <>
            <div className="subContainer">
              <span className="marketHeader stakedTokensHeader">
                Staked Assets
              </span>
            </div>
            <div>
              <div>
                <div className="row columnHeaders">
                  <div className="col-md-1">Asset</div>
                  <div className="col-md-2">Tokens Staked</div>
                  <div className="col-md-2">Market Value (USD)</div>
                  <div className="col-md-2">Accrued Interest (USD)</div>
                  <div className="col-md-2">Accrued Interest (ETH)</div>
                  <div className="col-md-2"></div>
                </div>
              </div>
              <br />
              {assets.length > 0 &&
                assets.map((a, idx) => (
                  <div className="row">
                    <div className="col-md-1">{displayLogo(a.tokenSymbol)}</div>
                    <div className="col-md-2">{a.tokensStaked}</div>
                    <div className="col-md-2">{a.usdValue}</div>
                    <div className="col-md-2">{a.usdAccruedInterest}</div>
                    <div className="col-md-2">{a.ethAccruedInterest}</div>
                    <div className="col-md-2">
                      {a.open ? (
                        <div
                          onClick={() => withdraw(a.positionId)}
                          className="orangeMiniButton"
                        >
                          Withdraw
                        </div>
                      ) : (
                        <span>closed</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <div onClick={() => connectAndLoad()} className="connectButton">
            Connect Wallet
          </div>
        )}
      </div>
      {showStakeModal && (
        <StakeModal
          onClose={() => setShowStakeModal(false)}
          stakeTokenSymbol={stakeTokenSymbol}
          setStakeTokenQuantity={setStakeTokenQuantity}
          stakeTokens={stakeTokens}
        />
      )}
    </div>
  );
}

export default App;
