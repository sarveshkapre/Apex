import { createApp } from "./app";

const { app } = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Apex control plane API listening on http://localhost:${port}`);
});
