import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../extension-settings.js";
import { eventSource, event_types } from "../../../../script.js";

const extensionName = "st-family-tree";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Хранилище деревьев для разных чатов
let familyTrees = {}; 
let currentChatId = null;

async function loadHtml() {
    const response = await fetch(`${extensionFolderPath}/template.html`);
    const html = await response.text();
    $("body").append(html);
}

async function loadCss() {
    $("head").append(`<link rel="stylesheet" href="${extensionFolderPath}/style.css">`);
}

// Отрисовка конкретного персонажа
function renderNode(character) {
    const template = document.getElementById("ft-node-template").content.cloneNode(true);
    const nodeEl = template.querySelector(".ft-node");
    
    nodeEl.id = `node-${character.id}`;
    nodeEl.style.left = character.x + "px";
    nodeEl.style.top = character.y + "px";
    
    nodeEl.querySelector(".ft-avatar").src = character.iconUrl || "img/fluffy.png"; // дефолтная аватарка ST
    nodeEl.querySelector(".ft-name").textContent = character.name;
    nodeEl.querySelector(".ft-age span").textContent = character.age;
    nodeEl.querySelector(".ft-status span").textContent = character.isAlive ? "Жив" : "Мертв";
    
    document.getElementById("ft-nodes-layer").appendChild(nodeEl);
}

// Отрисовка линии между двумя ID
function renderLine(sourceId, targetId) {
    const sourceEl = document.getElementById(`node-${sourceId}`);
    const targetEl = document.getElementById(`node-${targetId}`);
    if (!sourceEl || !targetEl) return;

    // Вычисляем центры карточек
    const x1 = sourceEl.offsetLeft + sourceEl.offsetWidth / 2;
    const y1 = sourceEl.offsetTop + sourceEl.offsetHeight / 2;
    const x2 = targetEl.offsetLeft + targetEl.offsetWidth / 2;
    const y2 = targetEl.offsetTop + targetEl.offsetHeight / 2;

    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#888');
    line.setAttribute('stroke-width', '2');

    document.getElementById("ft-lines-layer").appendChild(line);
}

// Обновление рабочей области
function refreshWorkspace() {
    document.getElementById("ft-nodes-layer").innerHTML = "";
    document.getElementById("ft-lines-layer").innerHTML = "";

    if (!currentChatId || !familyTrees[currentChatId]) return;

    const tree = familyTrees[currentChatId];
    
    // Сначала рисуем ноды
    tree.characters.forEach(renderNode);
    // Затем рисуем связи
    tree.connections.forEach(conn => renderLine(conn.from, conn.to));
}

// Добавление нового персонажа
function addCharacter() {
    if (!currentChatId) return alert("Сначала откройте чат!");
    
    // В реальном расширении здесь лучше сделать красивое модальное окно ST (Popup)
    const name = prompt("Имя персонажа:");
    if (!name) return;
    const age = prompt("Возраст:");
    const isAlive = confirm("Персонаж жив? (ОК - да, Отмена - нет)");
    const iconUrl = prompt("URL иконки (оставьте пустым для стандарта):");

    if (!familyTrees[currentChatId]) {
        familyTrees[currentChatId] = { characters: [], connections: [] };
    }

    const newChar = {
        id: Date.now().toString(), // уникальный ID
        name, age, isAlive, iconUrl,
        x: 100, y: 100 // Позиция по умолчанию
    };

    familyTrees[currentChatId].characters.push(newChar);
    
    // Сохраняем в настройки ST
    extension_settings[extensionName] = familyTrees;
    saveSettingsDebounced();
    
    refreshWorkspace();
}

// Инициализация при запуске ST
jQuery(async () => {
    await loadHtml();
    await loadCss();

    // Загружаем сохраненные данные
    if (extension_settings[extensionName]) {
        familyTrees = extension_settings[extensionName];
    }

    // Слушаем смену чата, чтобы переключать древо
    eventSource.on(event_types.CHAT_CHANGED, () => {
        const context = getContext();
        currentChatId = context.chatId;
        refreshWorkspace();
    });

    // Добавляем кнопку в верхнее меню расширений ST
    const buttonHtml = `
        <div id="ft-open-btn" class="extensionsMenuExtensionButton">
            <i class="fa-solid fa-network-wired"></i> Семейное древо
        </div>`;
    $("#extensionsMenu").append(buttonHtml);

    // Обработчики событий кнопок
    $("#ft-open-btn").on("click", () => {
        $("#ft-modal").css("display", "flex");
        refreshWorkspace(); // Отрисовываем при открытии
    });
    
    $("#ft-close-btn").on("click", () => $("#ft-modal").css("display", "none"));
    $("#ft-add-char-btn").on("click", addCharacter);
});