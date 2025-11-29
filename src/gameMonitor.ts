import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';

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

// LeaguePool ABI (minimal - just the function we need)
const LEAGUE_POOL_ABI = [
  'function forwardFeesToBC(string memory tokenName) external',
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

      const tokenName = TEAM_TOKENS[winnerName];
      if (!tokenName) {
        console.error(`No token name mapping found for winner: ${winnerName}`);
        continue;
      }

      console.log(`\n🏈 Processing completed game: ${game.name}`);
      console.log(`Winner: ${winnerName}`);
      console.log(`Token Name: ${tokenName}`);

      try {
        // Estimate gas first
        const gasEstimate = await this.leaguePool.estimateGas.forwardFeesToBC(tokenName);
        console.log(`Estimated gas: ${gasEstimate.toString()}`);

        // Call forwardFeesToBC with 20% buffer
        const tx = await this.leaguePool.forwardFeesToBC(tokenName, {
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
