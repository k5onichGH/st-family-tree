import { getContext, extension_settings } from "../../../extensions.js";

// Уникальный ID нашего расширения для сохранения настроек
const EXTENSION_NAME = "family_tree";

// Состояние древа в памяти (карточки и связи)
let treeData = {
    nodes: [], // { id, x, y, name, age, status, image }
    links: []  // { sourceId, targetId } (Для расширения функционала в будущем)
};

// Загрузка HTML
async function loadHtml() {
    const response = await fetch('/scripts/extensions/family-tree/ui.html');
    if (response.ok) {
        const html = await response.text();
        $('body').append(html);
    }
}

// Инициализация расширения
async function init() {
    await loadHtml();

    // 1. Добавляем иконку дерева в верхнее меню SillyTavern
    const treeIconHtml = `<div id="ft_top_menu_btn" class="menu_button fas fa-tree" title="Семейное древо"></div>`;
    $('#rm_button_group_chats').append(treeIconHtml);

    // 2. Слушатели событий окна
    $('#ft_top_menu_btn').on('click', openFamilyTree);
    $('#ft_close').on('click', () => $.magnificPopup.close());
    $('#ft_add_character').on('click', addNewCharacter);

    // 3. Привязка к активному чату
    // SillyTavern вызывает событие, когда чат меняется. Загружаем данные для нового чата.
    const context = getContext();
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, loadTreeDataForCurrentChat);
}

// Открытие окна
function openFamilyTree() {
    $.magnificPopup.open({
        items: {
            src: '#family_tree_popup',
            type: 'inline'
        },
        callbacks: {
            open: function() {
                renderTree();
            }
        }
    });
}

// Генерация уникального ID
function generateId() {
    return 'node_' + Math.random().toString(36).substr(2, 9);
}

// Добавление нового персонажа (кнопка)
function addNewCharacter() {
    const newNode = {
        id: generateId(),
        x: 50, // Координаты появления
        y: 50,
        name: "",
        age: "",
        status: "alive",
        image: "img/ai4.png" // Дефолтная картинка SillyTavern
    };
    treeData.nodes.push(newNode);
    saveTreeData();
    renderTree();
}

// Отрисовка всех элементов на холсте
function renderTree() {
    const workspace = $('#family_tree_workspace');
    // Очищаем старые карточки (оставляем только SVG)
    workspace.find('.ft-card').remove();
    
    const template = document.getElementById('ft_card_template').content;

    treeData.nodes.forEach(nodeData => {
        const clone = document.importNode(template, true);
        const card = $(clone.querySelector('.ft-card'));
        
        card.attr('data-id', nodeData.id);
        card.css({ left: nodeData.x + 'px', top: nodeData.y + 'px' });
        
        card.find('.ft-input-name').val(nodeData.name);
        card.find('.ft-input-age').val(nodeData.age);
        card.find('.ft-input-status').val(nodeData.status);
        
        // Слушатели для сохранения данных при редактировании полей
        card.find('input, select').on('change', function() {
            nodeData.name = card.find('.ft-input-name').val();
            nodeData.age = card.find('.ft-input-age').val();
            nodeData.status = card.find('.ft-input-status').val();
            saveTreeData();
        });

        // Удаление карточки
        card.find('.ft-delete-btn').on('click', function() {
            treeData.nodes = treeData.nodes.filter(n => n.id !== nodeData.id);
            saveTreeData();
            renderTree();
        });

        setupDragAndDrop(card[0], nodeData);
        workspace.append(card);
    });

    drawLines();
}

// Логика Drag and Drop (перетаскивания)
function setupDragAndDrop(element, nodeData) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    $(element).on('mousedown', function(e) {
        // Игнорируем клики по инпутам, чтобы можно было вводить текст
        if ($(e.target).is('input, select, button')) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseInt($(element).css('left'), 10);
        initialTop = parseInt($(element).css('top'), 10);
        
        $(element).css('z-index', 1000); // Помещаем поверх остальных
    });

    $(document).on('mousemove', function(e) {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        nodeData.x = initialLeft + dx;
        nodeData.y = initialTop + dy;
        
        $(element).css({
            left: nodeData.x + 'px',
            top: nodeData.y + 'px'
        });
        
        drawLines(); // Динамически обновляем линии при перетаскивании
    });

    $(document).on('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            $(element).css('z-index', 1);
            saveTreeData(); // Сохраняем новую позицию
        }
    });
}

// Отрисовка связей (линий)
function drawLines() {
    const svg = document.getElementById('ft_lines_layer');
    svg.innerHTML = ''; // Очищаем старые линии

    // Пример: рисуем линию между каждыми последовательно добавленными карточками (как заглушка).
    // В полноценном расширении здесь будет цикл по массиву treeData.links
    for (let i = 0; i < treeData.nodes.length - 1; i++) {
        const n1 = treeData.nodes[i];
        const n2 = treeData.nodes[i+1];
        
        // Рисуем от центра одной карточки до центра другой
        // (160 - ширина карточки, ~200 - примерная высота)
        const x1 = n1.x + 80; 
        const y1 = n1.y + 100;
        const x2 = n2.x + 80;
        const y2 = n2.y + 100;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', 'ft-connection-line');
        
        svg.appendChild(line);
    }
}

// Сохранение и загрузка данных
function getChatId() {
    const context = getContext();
    return context.chatId || "default"; 
}

function saveTreeData() {
    const chatId = getChatId();
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {};
    }
    extension_settings[EXTENSION_NAME][chatId] = treeData;
    getContext().saveSettings(); // API SillyTavern для сохранения extension_settings на диск
}

function loadTreeDataForCurrentChat() {
    const chatId = getChatId();
    if (extension_settings[EXTENSION_NAME] && extension_settings[EXTENSION_NAME][chatId]) {
        treeData = extension_settings[EXTENSION_NAME][chatId];
    } else {
        treeData = { nodes: [], links: [] };
    }
    // Если окно открыто в момент смены чата — перерисовываем
    if ($.magnificPopup.instance.isOpen && $('#family_tree_popup').is(':visible')) {
        renderTree();
    }
}

// Запускаем при загрузке расширений
jQuery(async () => {
    try {
        await init();
    } catch (error) {
        console.error("[Family Tree] Ошибка инициализации:", error);
    }
});