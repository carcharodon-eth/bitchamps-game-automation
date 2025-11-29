import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// Token address mapping (same as your app config)
const TEAM_TOKENS: Record<string, string> = {
  'Atlanta Falcons': '0x175e58268b208831adb3025120686e8fd77579a6',
  'Arizona Cardinals': '0xc9e4A69745867eeEb968b6Cb9d1e1F64e297Be97',
  'Baltimore Ravens': '0x736daf2b3ba7ab3ab676c275b01e1455492141a9',
  'Buffalo Bills': '0xf72b1d2e4f86f73254c62bf83096a8562ef1065f',
  'Carolina Panthers': '0xe749f9deea902845275b7ea1c8dbfe20df4e0a3c',
  'Chicago Bears': '0xe57352f339598c61c99b3a00f1e6d7473774b3d9',
  'Cincinnati Bengals': '0x1311afe2b1df1f4aca36da81c3d15b4d42d2e830',
  'Cleveland Browns': '0xbfe9bc70d905649c30449eadfcadd27e33d2fbb6',
  'Dallas Cowboys': '0x9e32a40b7e872db2d56ebf36d8e050d3b2b0143e',
  'Denver Broncos': '0x79aa64275f10061c83546960d871b12903e1a57d',
  'Detroit Lions': '0x522ac1995a7273fa5dd00e4a96e8f83e585fb778',
  'Green Bay Packers': '0xe678d2282c45a27c2878577271175e51ae3e0d99',
  'Houston Texans': '0x95798093b11befe217a1221314506bb04773f8ac',
  'Indianapolis Colts': '0x63000c40a6ad1cb6abae664bd028f98b586f969b',
  'Jacksonville Jaguars': '0x8091d014c2743870b31f20c4da795a8b23620b5d',
  'Kansas City Chiefs': '0x4856ea3e36d60215ca439629638eabae9a30998e',
  'Las Vegas Raiders': '0x9dbdfce305c96cbd520bee7cdf2cdbf6e30e66a7',
  'Los Angeles Chargers': '0x7dbd9ee9d870f302404e0c1507e7b266d08c2458',
  'Los Angeles Rams': '0xd382b5efb38f36e9b40ccfc1b9d32acb66b6c886',
  'Miami Dolphins': '0xaf8076d8c467b9bda6d473d36fc4ec5adfa9a570',
  'Minnesota Vikings': '0xb0424042729c539c1a4addabc4e16f28b7cb1eab',
  'New England Patriots': '0x675e3840c2adaec6928a2bfce5129d48b36a93c6',
  'New Orleans Saints': '0xd3c20d290f17e4e794ff50de11a05c7515e5937f',
  'New York Giants': '0x28ce5e130f8902f05131e073fe252444e2743c09',
  'New York Jets': '0xc2e12df44b37a2e08ba9bcdfc30e2dfe0844419b',
  'Philadelphia Eagles': '0x60ec0c6c60eee5c3ffd7446dc369c5d7b85e4f1d',
  'Pittsburgh Steelers': '0xaa7512fa3c6f058d483a84fb2014e0fe22bd5537',
  'San Francisco 49ers': '0x6e9a75c723a6779cce7e3bba736b1fb2c1c52374',
  'Seattle Seahawks': '0x8d6760aad1de89c0e99b4b9c3212a7309d20e788',
  'Tampa Bay Buccaneers': '0x5838ab7c82df653c74f235da01bd9bded1f10c59',
  'Tennessee Titans': '0xfb18c2bc04105474fda0b969985ded7a87eeb228',
  'Washington Commanders': '0x1e0249a94bc08388884f32db1f8d456220698fcd',
};

// LeaguePool ABI (minimal - just the function we need)
const LEAGUE_POOL_ABI = [
  'function forwardFeesToBC(address bctoken) external',
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

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, this.provider);
    this.leaguePool = new ethers.Contract(
      process.env.LEAGUE_POOL_ADDRESS!,
      LEAGUE_POOL_ABI,
      this.wallet
    );
    this.processedGames = new Set<string>();
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

      const winnerToken = TEAM_TOKENS[winnerName];
      if (!winnerToken) {
        console.error(`No token found for winner: ${winnerName}`);
        continue;
      }

      console.log(`\n🏈 Processing completed game: ${game.name}`);
      console.log(`Winner: ${winnerName}`);
      console.log(`Token: ${winnerToken}`);

      try {
        // Estimate gas first
        const gasEstimate = await this.leaguePool.estimateGas.forwardFeesToBC(winnerToken);
        console.log(`Estimated gas: ${gasEstimate.toString()}`);

        // Call forwardFeesToBC with 20% buffer
        const tx = await this.leaguePool.forwardFeesToBC(winnerToken, {
          gasLimit: gasEstimate.mul(120).div(100),
        });

        console.log(`Transaction sent: ${tx.hash}`);
        console.log('Waiting for confirmation...');

        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);

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
