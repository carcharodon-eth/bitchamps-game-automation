# Deploying to Railway

## Quick Setup (5 minutes)

### 1. Prepare Your Repository

First, you need to push this `game-automation/` directory to a GitHub repository:

```bash
cd game-automation
git init
git add .
git commit -m "Initial commit - NFL game automation service"

# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/bitchamps-game-automation.git
git push -u origin main
```

### 2. Deploy to Railway

1. **Sign up for Railway**: Go to https://railway.app and sign in with GitHub

2. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `bitchamps-game-automation` repository
   - Railway will automatically detect it's a Node.js project

3. **Add Environment Variables**:
   - In your Railway project dashboard, go to "Variables" tab
   - Add these variables:

   ```
   PRIVATE_KEY=0x...your_private_key_here...
   RPC_URL=https://mainnet.infura.io/v3/348bd283eeb1480ab5ce5f435995603d
   LEAGUE_POOL_ADDRESS=0x4e5e6b9c9871E2B5D42107051B174aBB13D1cdcB
   POLL_INTERVAL_MINUTES=5
   ```

   **IMPORTANT**: Use a dedicated wallet with only small amounts of ETH for gas. DO NOT use your main deployment wallet!

4. **Deploy**:
   - Railway will automatically build and deploy
   - The service will start running 24/7

### 3. Monitor Your Service

- **View Logs**: Click "Deployments" → "View Logs" to see the monitor output
- **Check Status**: The service should show as "Active"
- **Restart**: If needed, click "Restart" in the deployment menu

### Expected Log Output

You should see logs like:
```
🚀 NFL Game Monitor Started
Wallet: 0x...
LeaguePool: 0x4e5e6b9c9871E2B5D42107051B174aBB13D1cdcB
Balance: 0.05 ETH

[2024-01-15T12:00:00.000Z] Checking for completed games...
Found 16 games this week

🏈 Processing completed game: Kansas City Chiefs at Buffalo Bills
Winner: Kansas City Chiefs
Token: 0x4856ea3e36d60215ca439629638eabae9a30998e
Estimated gas: 150000
Transaction sent: 0x...
✅ Transaction confirmed in block 18950123
Gas used: 142350
```

## Cost

- **Free Plan**: Railway offers a free trial with limited hours
- **Hobby Plan**: $5/month for 500 hours (~20 days)
- **Pro Plan**: $20/month for unlimited hours (recommended for 24/7 operation)

## Updating the Service

After making code changes:

```bash
git add .
git commit -m "Update game monitor"
git push
```

Railway will automatically detect the push and redeploy.

## Troubleshooting

### Service Keeps Restarting
- Check logs for errors
- Verify environment variables are set correctly
- Ensure wallet has sufficient ETH balance

### No Transactions Being Sent
- Verify games are actually completed (check ESPN API)
- Check that team names match exactly (case-sensitive)
- Ensure wallet has enough ETH for gas

### Gas Estimation Failures
- LeaguePool contract might have an issue
- Try manually calling `forwardFeesToBC` on Etherscan to test
- Check that the winning team's token address is correct

## Alternative: Railway CLI

You can also deploy using the Railway CLI:

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway variables set PRIVATE_KEY=0x...
railway variables set RPC_URL=https://mainnet.infura.io/v3/348bd283eeb1480ab5ce5f435995603d
railway variables set LEAGUE_POOL_ADDRESS=0x4e5e6b9c9871E2B5D42107051B174aBB13D1cdcB
railway variables set POLL_INTERVAL_MINUTES=5
```

## Security Notes

1. **Never commit your `.env` file** - it's in `.gitignore`
2. **Use a dedicated wallet** - fund with only what you need for gas
3. **Monitor gas prices** - the service estimates gas but Ethereum fees can spike
4. **Set up alerts** - Railway can notify you if the service goes down
