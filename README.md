# NFL Game Result Automation

This service automatically calls `forwardFeesToBC()` on the LeaguePool contract when NFL games conclude.

## Setup

1. Install dependencies:
```bash
cd game-automation
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Edit `.env` and add your private key for the gas wallet

4. Build and run:
```bash
npm run build
npm start
```

## How It Works

1. Polls ESPN API every 5 minutes for NFL scores
2. Detects completed games
3. Maps winning team to token address
4. Calls `forwardFeesToBC(winningTeamToken)`
5. Tracks processed games to avoid duplicates

## Security

- Store private key in `.env` (never commit!)
- Fund wallet with only necessary ETH (~0.1 ETH should cover a season)
- Use separate wallet from deployment wallet
- Monitor wallet balance

## Deployment

Run as a background service:
```bash
# Using PM2
npm install -g pm2
pm2 start dist/gameMonitor.js --name nfl-monitor
pm2 save
pm2 startup
```

## Monitoring

- Check logs: `pm2 logs nfl-monitor`
- Check status: `pm2 status`
- Restart: `pm2 restart nfl-monitor`
