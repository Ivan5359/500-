const missedInput = document.querySelector("#missed");
const valueInput = document.querySelector("#value");
const closeInput = document.querySelector("#close");
const resultOutput = document.querySelector("#result");

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function updateResult() {
  const missed = Number(missedInput.value) || 0;
  const jobValue = Number(valueInput.value) || 0;
  const closeRate = Math.min(Math.max(Number(closeInput.value) || 0, 0), 100) / 100;
  const monthlyRecovery = missed * jobValue * closeRate * 4;

  resultOutput.textContent = currency.format(monthlyRecovery);
}

[missedInput, valueInput, closeInput].forEach((input) => {
  input.addEventListener("input", updateResult);
});

updateResult();
