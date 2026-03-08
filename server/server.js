import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

app.get("/api/game", (req, res) => {
  const { date, home, away } = req.query;

  if (!date || !home || !away) {
    return res.status(400).json({ error: "Missing params" });
  }

  const gameKey = `${date}_${home}_${away}`;

  // 暫時回傳 mock
  const data = {
    gameKey,
    date,
    status: "scheduled",

    teams: {
      home: { id: home, name: "中信兄弟", short: "兄弟" },
      away: { id: away, name: "統一7-ELEVEn獅", short: "統一" }
    },

    score: { home: null, away: null },

    innings: {
      home: Array(9).fill(null),
      away: Array(9).fill(null),
      R: { home: null, away: null },
      H: { home: null, away: null },
      E: { home: null, away: null }
    },

    startingPitchers: { home: null, away: null },

    lineup: { published: false, home: [], away: [] },

    pitchers: { home: [], away: [] },

    umpires: {
      published: false,
      homePlate: null,
      firstBase: null,
      secondBase: null,
      thirdBase: null
    },

    postgame: { attendance: null, duration: null }
  };

  res.json(data);
});

app.listen(3001, () => {
  console.log("API running at http://localhost:3001");
});
