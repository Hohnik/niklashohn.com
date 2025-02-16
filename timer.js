const clock = document.getElementById("timer")

start = Math.floor(Date.now() / 1000)

const timer = setInterval(() => {
  delta = Math.floor(Date.now() / 1000) - start
  clock.innerText = formatTime(delta)
}, 1000);

function formatTime(seconds) {
  const hours = Math.floor(mins / 60);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMins = mins.toString().padStart(2, '0');
  const formattedSecs = secs.toString().padStart(2, '0');

  return `${formattedHours}:${formattedMins}:${formattedSecs}`;
}
