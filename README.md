# GTA VI Twitch Forecast

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/Tokocrypto96/gta6-twitch-ccu-forecast-01/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/Tokocrypto96/gta6-twitch-ccu-forecast-01/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Program Python yang memprediksi jumlah penonton Twitch kategori Grand Theft Auto VI
per jam di hari rilisnya, 19 November 2026 (UTC), dari angka jam pertama yang teramati —
23 jam ke depan, masing-masing sebagai 5 kuantil (5%, 25%, 50%, 75%, 95%).

Entry for [make.fun **gta6-twitch-ccu-forecast-01**](https://make.fun/bounty/gta6-twitch-ccu-forecast-01) ("Forecast GTA VI's launch-day Twitch viewers hour by hour", $250 in USDC).

## Cara kerja

Tanpa machine learning berat — cuma ada ~7 peluncuran analog dan nol riwayat GTA VI,
jadi model statistik sederhana yang paling masuk akal:

1. **Peer group**: dari `comparables` di case, ambil game yang unlock-nya *rolling midnight
   local* (cara GTA VI rilis: NZ dulu, lalu CET, UK, US East, US Pacific) dan tier-nya
   `comparable`. Game dengan unlock PC/simultan global dikecualikan — jam pertamanya
   sudah jadi puncak launch, jadi bentuk kurvanya tidak cocok untuk launch console-only.
   Riwayat pra-rilis kategori GTA VI sendiri juga dikecualikan (bukan kurva launch).
2. **Bentuk kurva**: untuk tiap jam, median antar peer dari `log(viewers_jam / viewers_jam1)`
   jadi bentuk median; simpangan baku log-ratio antar peer jadi lebar sebaran.
   Median forecast = `jam1 * exp(bentuk)`; kuantil = `median * exp(z_tau * sebaran)`.
3. **Deterministik**: tanpa random, tanpa jam dinding, tanpa internet — dua run
   menghasilkan byte yang identik. Fallback menjaga output tetap valid kalau datanya
   tidak lengkap.

## Backtest (4 launch latihan di kit, pinball loss skala log — makin kecil makin bagus)

| | Baseline (starter) | Entry ini |
|---|---|---|
| Keseluruhan | 0.3871 | **0.2459** (−36.5%) |
| Wolverine | 0.7437 | 0.4083 |
| Red Dead Redemption 2 | 0.2868 | 0.1393 |
| God of War Ragnarök | 0.2146 | 0.2059 |
| Spider-Man 2 | 0.3033 | 0.2300 |

## Menjalankan

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out python3 main.py
```

Membaca setiap `*.in` di direktori input dan menulis `<id>.out` ke direktori output:
`{"hours": [{"hour": 2, "q": [q05, q25, q50, q75, q95]}, ...]}` (23 baris, jam 2–24).
Python 3.13 stdlib saja, jalan < 1 detik per case.
