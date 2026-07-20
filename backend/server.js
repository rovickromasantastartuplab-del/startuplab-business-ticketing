import app from "./app.js";
import { startReservationCleanup } from "./utils/reservationCleanup.js";

const PORT = process.env.BACKEND_PORT;

startReservationCleanup();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
