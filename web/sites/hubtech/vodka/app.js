let shots = 0
let perClick = 1
const shotsTaken = document.getElementById('shotsTaken')

function updateDisplay() {
  shotsTaken.innerText = `${shots} Shots taken`
}

function clickedElement() {
  shots += perClick
  updateDisplay()
}

function buyUpgrade(upgradeCost, upgradeValue) {
  if (shots >= upgradeCost) {
    shots -= upgradeCost
    perClick += upgradeValue
    updateDisplay()
  } else {
    alert('Du er certified fattig!')
  }
}
updateDisplay()



