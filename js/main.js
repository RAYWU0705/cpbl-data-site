import { initHome } from "./pages/index.js";
import { initMatch } from "./pages/match.js";
import { initTeam } from "./pages/team.js";

const page = document.body.dataset.page;

switch (page) {
  case "home":
    initHome();
    break;
  case "match":
    initMatch();
    break;
  case "team":
    initTeam();
    break;
}
