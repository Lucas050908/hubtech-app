function getGroups() {
  return JSON.parse(localStorage.getItem('groups') || '[]');
}

function saveGroups(groups) {
  localStorage.setItem('groups', JSON.stringify(groups));
}

function renderGroupList() {
  const groupList = document.getElementById('groupList');
  const groupInput = document.getElementById('groupInput');
  const groups = getGroups();
  groupList.innerHTML = '';
  groupInput.innerHTML = '<option value="">Ingen</option>';
  groups.forEach(group => {
    const li = document.createElement('li');
    li.textContent = group;
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Slet';
    delBtn.onclick = () => {
      const updated = groups.filter(g => g !== group);
      saveGroups(updated);
      renderGroupList();
    };
    li.appendChild(delBtn);
    groupList.appendChild(li);

    const option = document.createElement('option');
    option.value = group;
    option.textContent = group;
    groupInput.appendChild(option);
  });
}

function addGroup() {
  const input = document.getElementById('newGroupInput');
  const newGroup = input.value.trim();
  if (newGroup) {
    const groups = getGroups();
    if (!groups.includes(newGroup)) {
      groups.push(newGroup);
      saveGroups(groups);
      renderGroupList();
      input.value = '';
    }
  }
}