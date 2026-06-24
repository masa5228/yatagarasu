import { startServer } from './index';

startServer().then((port) => {
  console.log(`◈ Yatagarasu (dev API) on http://localhost:${port}`);
});
