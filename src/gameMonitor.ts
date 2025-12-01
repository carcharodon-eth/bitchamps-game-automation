import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { TwitterApi } from 'twitter-api-v2';

dotenv.config();

// Team name mapping: ESPN full names -> Token short names
// forwardFeesToBC expects the short token name as a string parameter
const TEAM_TOKENS: Record<string, string> = {
  'Atlanta Falcons': 'Atlanta',
  'Arizona Cardinals': 'Arizona',
  'Baltimore Ravens': 'Baltimore',
  'Buffalo Bills': 'Buffalo',
  'Carolina Panthers': 'Carolina',
  'Chicago Bears': 'Chicago',
  'Cincinnati Bengals': 'Cincinnati',
  'Cleveland Browns': 'Cleveland',
  'Dallas Cowboys': 'Dallas',
  'Denver Broncos': 'Denver',
  'Detroit Lions': 'Detroit',
  'Green Bay Packers': 'Green Bay',
  'Houston Texans': 'Houston',
  'Indianapolis Colts': 'Indianapolis',
  'Jacksonville Jaguars': 'Jacksonville',
  'Kansas City Chiefs': 'Kansas City',
  'Las Vegas Raiders': 'Las Vegas',
  'Los Angeles Chargers': 'Los Angeles (C)',
  'Los Angeles Rams': 'Los Angeles (R)',
  'Miami Dolphins': 'Miami',
  'Minnesota Vikings': 'Minnesota',
  'New England Patriots': 'New England',
  'New Orleans Saints': 'New Orleans',
  'New York Giants': 'New York (G)',
  'New York Jets': 'New York (J)',
  'Philadelphia Eagles': 'Philadelphia',
  'Pittsburgh Steelers': 'Pittsburgh',
  'San Francisco 49ers': 'San Francisco',
  'Seattle Seahawks': 'Seattle',
  'Tampa Bay Buccaneers': 'Tampa Bay',
  'Tennessee Titans': 'Tennessee',
  'Washington Commanders': 'Washington',
};

// Token contract addresses for each team
const TOKEN_ADDRESSES: Record<string, string> = {
  'Atlanta': '0x175E58268B208831aDB3025120686E8FD77579a6',
  'Arizona': '0xc9e4A69745867eeEb968b6Cb9d1e1F64e297Be97',
  'Baltimore': '0x736DAF2b3ba7ab3ab676c275B01e1455492141a9',
  'Buffalo': '0xF72B1D2E4f86F73254c62BF83096a8562eF1065f',
  'Carolina': '0xe749f9DEeA902845275B7ea1c8dBFe20DF4e0A3C',
  'Cincinnati': '0x1311afe2b1dF1F4Aca36DA81c3D15b4D42D2e830',
  'Cleveland': '0xbFE9bc70d905649C30449EaDFcADD27e33d2Fbb6',
  'Dallas': '0x9E32a40b7E872DB2d56eBF36D8E050d3b2b0143e',
  'Denver': '0x79aa64275f10061C83546960D871b12903e1A57D',
  'Detroit': '0x522Ac1995A7273fA5DD00e4A96e8f83E585FB778',
  'Green Bay': '0xe678d2282c45A27C2878577271175e51AE3E0d99',
  'Houston': '0x95798093b11BEfE217A1221314506Bb04773F8Ac',
  'Indianapolis': '0x63000C40a6aD1cb6aBAe664BD028f98B586F969b',
  'Jacksonville': '0x8091d014C2743870b31f20C4Da795a8b23620B5D',
  'Kansas City': '0x4856EA3E36d60215ca439629638eabaE9a30998E',
  'Las Vegas': '0x9DbDfCE305c96CBD520BEe7cDF2CdBf6e30e66A7',
  'Los Angeles (C)': '0x7DBD9Ee9d870F302404E0C1507e7B266D08C2458',
  'Los Angeles (R)': '0xd382b5EFb38f36E9B40CCfc1B9d32acB66B6c886',
  'Miami': '0xaF8076d8c467B9BdA6D473d36fc4EC5adfA9A570',
  'Minnesota': '0xb0424042729c539c1a4AdDabc4e16F28b7CB1eAb',
  'New England': '0x675e3840C2aDAeC6928A2BfCE5129d48B36A93C6',
  'New Orleans': '0xD3C20d290f17E4e794fF50De11A05c7515e5937F',
  'New York (G)': '0x28CE5e130F8902f05131E073fe252444E2743c09',
  'New York (J)': '0xC2E12Df44b37a2e08BA9bcdFc30e2DFe0844419b',
  'Philadelphia': '0x60ec0C6c60eEe5c3fFD7446dC369C5D7b85e4F1D',
  'Pittsburgh': '0xaA7512FA3C6f058d483A84Fb2014E0Fe22bd5537',
  'San Francisco': '0x6E9A75c723a6779cCe7E3bBA736B1fB2C1C52374',
  'Seattle': '0x8D6760aAd1De89c0e99b4b9c3212a7309d20E788',
  'Tampa Bay': '0x5838Ab7C82DF653c74F235DA01BD9bdED1f10c59',
  'Tennessee': '0xFb18c2bC04105474FDA0B969985Ded7A87EEb228',
  'Washington': '0x1E0249A94Bc08388884F32DB1f8D456220698fCd',
  'Chicago': '0xE57352F339598c61c99B3a00F1E6D7473774b3d9',
};

// LeaguePool ABI (minimal - just the function we need)
const LEAGUE_POOL_ABI = [
  'function forwardFeesToBC(string memory tokenName) external',
];

// Token contract ABI (for processTokenTwap and events)
const TOKEN_ABI = [
  'function processTokenTwap() external',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

interface Game {
  id: string;
  name: string;
  status: {
    type: {
      completed: boolean;
    };
  };
  competitions: Array<{
    competitors: Array<{
      team: {
        displayName: string;
        name: string;
      };
      score: string;
      homeAway: string;
    }>;
  }>;
}

class GameMonitor {
  private provider: ethers.providers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private leaguePool: ethers.Contract;
  private processedGames: Set<string>;
  private isFirstRun: boolean;
  private twitterClient: TwitterApi | null;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, this.provider);
    this.leaguePool = new ethers.Contract(
      process.env.LEAGUE_POOL_ADDRESS!,
      LEAGUE_POOL_ABI,
      this.wallet
    );
    this.processedGames = new Set<string>();
    this.isFirstRun = true;

    // Initialize Twitter client if credentials are provided
    if (process.env.TWITTER_APP_KEY && process.env.TWITTER_APP_SECRET &&
        process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET) {
      this.twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_APP_KEY,
        appSecret: process.env.TWITTER_APP_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
      });
      console.log('✅ Twitter client initialized');
    } else {
      this.twitterClient = null;
      console.log('⚠️  Twitter credentials not found, tweets will be skipped');
    }
  }

  async fetchNFLScores(): Promise<Game[]> {
    try {
      // ESPN API for current week NFL scores
      const response = await axios.get(
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
      );
      return response.data.events || [];
    } catch (error) {
      console.error('Error fetching NFL scores:', error);
      return [];
    }
  }

  async getCurrentGasPrice(): Promise<ethers.BigNumber> {
    try {
      // Fetch current gas price from RPC provider (based on recent blocks)
      const gasPrice = await this.provider.getGasPrice();
      const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
      console.log(`Current network gas price: ${gasPriceGwei} gwei`);
      return gasPrice;
    } catch (error: any) {
      console.error(`Failed to fetch gas price from provider: ${error.message}`);
      // Fallback to 1 gwei if RPC provider fails
      console.warn('⚠️  Using fallback gas price of 1 gwei');
      return ethers.utils.parseUnits('1', 'gwei');
    }
  }

  async postGameResultTweet(game: Game, winnerName: string, twapTxHash: string, tokensBurned: string) {
    if (!this.twitterClient) {
      console.log('📱 Twitter not configured, skipping tweet');
      return;
    }

    try {
      const competition = game.competitions[0];
      const [team1, team2] = competition.competitors;

      // Determine winner and loser
      const score1 = parseInt(team1.score);
      const score2 = parseInt(team2.score);
      const winner = score1 > score2 ? team1 : team2;
      const loser = score1 > score2 ? team2 : team1;
      const winnerScore = score1 > score2 ? score1 : score2;
      const loserScore = score1 > score2 ? score2 : score1;

      // Get team names without city (e.g., "Bears" from "Chicago Bears")
      const winnerTeamName = winner.team.name;
      const loserTeamName = loser.team.name;

      const tweet = `${winnerName} ${winnerTeamName} defeat the ${loserTeamName} ${winnerScore}-${loserScore}, triggering a buyback-and-burn of ${tokensBurned} ${winnerName} tokens!

https://etherscan.io/tx/${twapTxHash}`;

      console.log('📱 Posting to X:', tweet);
      await this.twitterClient.v2.tweet(tweet);
      console.log('✅ Tweet posted successfully!');
    } catch (error: any) {
      console.error('❌ Failed to post tweet:', error.message);
    }
  }

  getWinner(game: Game): string | null {
    const competition = game.competitions[0];
    if (!competition) return null;

    const [team1, team2] = competition.competitors;
    const score1 = parseInt(team1.score);
    const score2 = parseInt(team2.score);

    if (score1 === score2) return null; // Tie (rare in NFL)

    const winner = score1 > score2 ? team1 : team2;
    return winner.team.displayName;
  }

  async processCompletedGames(games: Game[]) {
    for (const game of games) {
      // Skip if not completed or already processed
      if (!game.status.type.completed || this.processedGames.has(game.id)) {
        continue;
      }

      const winnerName = this.getWinner(game);
      if (!winnerName) {
        console.log(`Game ${game.name} ended in a tie, skipping`);
        continue;
      }

      const tokenName = TEAM_TOKENS[winnerName];
      if (!tokenName) {
        console.error(`No token name mapping found for winner: ${winnerName}`);
        continue;
      }

      // On first run, just mark completed games as processed without calling contract
      if (this.isFirstRun) {
        console.log(`📋 Skipping already-completed game: ${game.name} (Winner: ${winnerName})`);
        this.processedGames.add(game.id);
        continue;
      }

      console.log(`\n🏈 Processing completed game: ${game.name}`);
      console.log(`Winner: ${winnerName}`);
      console.log(`Token Name: ${tokenName}`);

      try {
        // Fetch current safe gas price from Etherscan
        const gasPrice = await this.getCurrentGasPrice();

        // Call forwardFeesToBC with low gas price
        const tx = await this.leaguePool.forwardFeesToBC(tokenName, {
          gasPrice: gasPrice,
        });

        console.log(`Transaction sent: ${tx.hash}`);
        console.log('Waiting for confirmation...');

        const receipt = await tx.wait();
        console.log(`✅ forwardFeesToBC confirmed in block ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);

        // Now call processTokenTwap on the winning team's token contract
        const tokenAddress = TOKEN_ADDRESSES[tokenName];
        if (tokenAddress) {
          try {
            console.log(`\n💰 Calling processTokenTwap on ${tokenName} token...`);
            const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, this.wallet);

            const twapTx = await tokenContract.processTokenTwap({
              gasPrice: gasPrice,
            });

            console.log(`TWAP transaction sent: ${twapTx.hash}`);
            console.log('Waiting for TWAP confirmation...');

            const twapReceipt = await twapTx.wait();
            console.log(`✅ processTokenTwap confirmed in block ${twapReceipt.blockNumber}`);
            console.log(`Gas used: ${twapReceipt.gasUsed.toString()}`);

            // Parse the transaction to get burned tokens
            const deadAddress = '0x000000000000000000000000000000000000dEaD';
            const decimals = await tokenContract.decimals();

            // Find Transfer event to dead address
            let tokensBurned = '0';
            for (const log of twapReceipt.logs) {
              try {
                const parsed = tokenContract.interface.parseLog(log);
                if (parsed.name === 'Transfer' && parsed.args.to.toLowerCase() === deadAddress.toLowerCase()) {
                  const burnedAmount = ethers.utils.formatUnits(parsed.args.value, decimals);
                  // Round to whole number
                  tokensBurned = Math.round(parseFloat(burnedAmount)).toLocaleString();
                  break;
                }
              } catch (e) {
                // Not a token contract log, skip
              }
            }

            // Post to X/Twitter
            await this.postGameResultTweet(game, winnerName, twapTx.hash, tokensBurned);
          } catch (twapError: any) {
            // It's OK if TWAP fails (delay not met, no ETH to TWAP, etc.)
            console.warn(`⚠️  processTokenTwap failed (this is normal): ${twapError.message}`);
          }
        }

        // Mark as processed
        this.processedGames.add(game.id);
      } catch (error) {
        console.error(`❌ Error processing game ${game.id}:`, error);
      }
    }
  }

  async run() {
    console.log('🚀 NFL Game Monitor Started');
    console.log(`Wallet: ${this.wallet.address}`);
    console.log(`LeaguePool: ${this.leaguePool.address}`);

    const balance = await this.wallet.getBalance();
    console.log(`Balance: ${ethers.utils.formatEther(balance)} ETH\n`);

    if (balance.lt(ethers.utils.parseEther('0.01'))) {
      console.warn('⚠️  WARNING: Wallet balance is low! Please fund with ETH for gas.');
    }

    const pollInterval = (parseInt(process.env.POLL_INTERVAL_MINUTES!) || 5) * 60 * 1000;

    const poll = async () => {
      console.log(`[${new Date().toISOString()}] Checking for completed games...`);

      const games = await this.fetchNFLScores();
      console.log(`Found ${games.length} games this week`);

      await this.processCompletedGames(games);

      // After first run, start processing new completions
      if (this.isFirstRun) {
        this.isFirstRun = false;
        console.log('✅ Initialization complete. Now monitoring for new game completions...\n');
      }

      // Check balance periodically
      const currentBalance = await this.wallet.getBalance();
      if (currentBalance.lt(ethers.utils.parseEther('0.01'))) {
        console.warn(`⚠️  Low balance: ${ethers.utils.formatEther(currentBalance)} ETH`);
      }
    };

    // Initial poll
    await poll();

    // Set up recurring poll
    setInterval(poll, pollInterval);
  }
}

// Start the monitor
const monitor = new GameMonitor();
monitor.run().catch(console.error);
