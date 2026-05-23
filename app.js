// Initial Static Task Data (Original Baseline Schedule)
const ORIGINAL_TASKS = [
    {
        id: 1,
        title: "A지구 철근 자재 대량 반입",
        startTime: "09:00",
        endTime: "11:00",
        duration: 120, // in minutes
        location: "북부 IC → A지구 현장",
        type: "transport",
        icon: "truck",
        prerequisiteIds: []
    },
    {
        id: 2,
        title: "B지구 실내 가설재 해체 및 정리",
        startTime: "11:00",
        endTime: "11:30",
        duration: 30,
        location: "B지구 빌딩 내부",
        type: "indoor",
        icon: "calendar",
        prerequisiteIds: []
    },
    {
        id: 3,
        title: "B지구 내부 배선 및 전력망 점검",
        startTime: "11:30",
        endTime: "12:00",
        duration: 30,
        location: "B지구 빌딩 내부",
        type: "indoor",
        icon: "calendar",
        prerequisiteIds: [2] // Depends on cleanup
    },
    {
        id: 4,
        title: "A지구 1층 기초 골조 조립",
        startTime: "12:00",
        endTime: "14:00",
        duration: 120,
        location: "A지구 공사현장",
        type: "construction",
        icon: "anvil",
        prerequisiteIds: [1] // Depends on material delivery
    },
    {
        id: 5,
        title: "A지구 타워크레인 해체 준비",
        startTime: "14:00",
        endTime: "15:30",
        duration: 90,
        location: "A지구 옥상",
        type: "outdoor",
        icon: "construction",
        prerequisiteIds: [4] // Depends on frame assembly
    },
    {
        id: 6,
        title: "현장 전체 안전 관리 종합 점검",
        startTime: "15:30",
        endTime: "16:30",
        duration: 60,
        location: "현장 사무소 및 A/B지구",
        type: "indoor",
        icon: "shield-check",
        prerequisiteIds: [3, 5] // Depends on wiring check and crane dismantling prep
    }
];

// Load from localStorage and migrate prerequisiteId -> prerequisiteIds safely
let activeTasks = JSON.parse(localStorage.getItem("activeTasksV6")) || [...ORIGINAL_TASKS];
activeTasks.forEach(task => {
    if (task.prerequisiteId !== undefined && task.prerequisiteIds === undefined) {
        task.prerequisiteIds = task.prerequisiteId ? [Number(task.prerequisiteId)] : [];
        delete task.prerequisiteId;
    }
    if (!task.prerequisiteIds) {
        task.prerequisiteIds = [];
    }
});

// Current simulator state
let currentState = {
    weather: "clear", // clear, rain, snow
    traffic: "normal", // normal, busy, jammed
    incident: "none" // none, accident
};

// Saved ID for pending deletion
let pendingDeleteId = null;

// DOM Elements
const originalTimeline = document.getElementById("original-timeline");
const adjustedTimeline = document.getElementById("adjusted-timeline");
const aiExplanationText = document.getElementById("ai-explanation-text");
const btnOptimize = document.getElementById("btn-optimize");
const liveTimeEl = document.getElementById("live-time");

// Helper: Convert "HH:MM" to minutes from 00:00
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
}

// Helper: Convert minutes from 00:00 to "HH:MM"
function minutesToTime(mins) {
    const hours = Math.floor(mins / 60) % 24;
    const minutes = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Format duration
function formatDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}시간 ${m > 0 ? m + '분' : ''}` : `${m}분`;
}

// Helper: Get task title by its ID
function getTaskTitleById(id) {
    if (!id) return "";
    const t = activeTasks.find(x => x.id === Number(id));
    return t ? t.title : "";
}

// Render Original Timeline
function renderOriginalTimeline() {
    originalTimeline.innerHTML = activeTasks.map(task => {
        const prereqList = (task.prerequisiteIds || []).map(pId => getTaskTitleById(pId)).filter(Boolean);
        const prereqText = prereqList.length > 0 
            ? `<span style="font-size: 0.75rem; color: var(--accent-blue); background: rgba(0, 242, 254, 0.1); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="link" style="width: 12px; height: 12px;"></i>선행: ${prereqList.join(", ")}</span>` 
            : "";
        
        return `
            <div class="timeline-item" style="position: relative; padding-right: 70px;">
                <div class="timeline-time">
                    <span>${task.startTime} - ${task.endTime}</span>
                    <span class="duration">${formatDuration(task.duration)}</span>
                </div>
                <div class="timeline-title">${task.title}</div>
                <div class="timeline-meta" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                    <span><i data-lucide="map-pin"></i> ${task.location}</span>
                    ${prereqText}
                </div>
                <div class="task-actions" style="position: absolute; top: 12px; right: 12px; display: flex; gap: 8px;">
                    <button class="action-btn btn-edit" data-id="${task.id}" style="background: none; border: none; color: var(--accent-blue); cursor: pointer; padding: 2px;" title="수정"><i data-lucide="edit-3" style="width: 14px; height: 14px;"></i></button>
                    <button class="action-btn btn-delete" data-id="${task.id}" style="background: none; border: none; color: var(--accent-red); cursor: pointer; padding: 2px;" title="삭제"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                </div>
            </div>
        `;
    }).join("");
    
    setupTimelineActions();
    lucide.createIcons();
}

// Sync both APIs via Node.js backend and update engine state
async function syncRealTimeAPIs() {
    const badge = document.getElementById("schedule-status-badge");
    badge.textContent = "공공데이터 동기화 중...";
    badge.style.background = "rgba(0, 242, 254, 0.1)";
    badge.style.color = "var(--accent-blue)";
    
    const apiLogs = [];
    
    try {
        const response = await fetch('/api/weather-traffic');
        if (!response.ok) throw new Error("백엔드 API 서버 응답 오류");
        const data = await response.json();
        
        // 1. Weather API Sync
        if (data.weather) {
            currentState.weather = data.weather;
            updateIcons("weather", data.weather);
            apiLogs.push(`⛅ <strong>[기상청 API 연동성공]</strong> 실시간 강수 상태가 <strong>${data.weather === 'clear' ? '맑음' : data.weather === 'rain' ? '우천(폭우)' : '강설(폭설)'}</strong>으로 동기화되었습니다.`);
        } else {
            apiLogs.push(`⚠️ <strong>[기상청 API 연동실패]</strong> 백엔드 오류로 인해 모의 기상 데이터를 적용합니다.`);
        }

        // 2. Traffic API Sync
        if (data.traffic && data.traffic.state) {
            currentState.traffic = data.traffic.state;
            const extraStr = `${data.traffic.hourly.toLocaleString()}대`;
            updateIcons("traffic", data.traffic.state, extraStr);
            apiLogs.push(`🚗 <strong>[도로공사 API 연동성공]</strong> 전국 실시간 교통량 총 <strong>${data.traffic.hourly.toLocaleString()}대</strong>가 집계되어, <strong>${data.traffic.state === 'normal' ? '원활' : data.traffic.state === 'busy' ? '혼잡' : '정체'}</strong> 상태로 동기화되었습니다.`);
        } else {
            apiLogs.push(`⚠️ <strong>[도로공사 API 연동실패]</strong> 백엔드 오류로 인해 모의 교통 모드를 적용합니다.`);
        }
    } catch (e) {
        console.error("Failed to sync with weather-traffic API:", e);
        apiLogs.push(`⚠️ <strong>[API 서버 연동 오류]</strong> Node.js 백엔드 서버에서 데이터를 가져올 수 없습니다. 모의 데이터로 대체 처리합니다.`);
    }

    runSchedulingEngine(apiLogs);
    
    badge.textContent = "실시간 최적화 완료";
    badge.style.background = "rgba(0, 230, 118, 0.1)";
    badge.style.color = "var(--accent-green)";
}

// Setup edit/delete action listeners on the timeline items
function setupTimelineActions() {
    document.querySelectorAll(".btn-edit").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = Number(btn.getAttribute("data-id"));
            openTaskModal(id);
        });
    });
    document.querySelectorAll(".btn-delete").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = Number(btn.getAttribute("data-id"));
            openDeleteConfirm(id);
        });
    });
}

// Open beautiful custom confirmation modal
function openDeleteConfirm(id) {
    pendingDeleteId = id;
    const modal = document.getElementById("confirm-modal");
    if (modal) modal.style.display = "flex";
}

// Populate prerequisite checkboxes selector excluding current task to prevent loops
function populatePrerequisitesCheckboxes(excludeId = null, selectedIds = []) {
    const container = document.getElementById("prerequisites-checkboxes-container");
    if (!container) return;
    
    container.innerHTML = '';
    
    const availableTasks = activeTasks.filter(task => excludeId === null || task.id !== Number(excludeId));
    
    if (availableTasks.length === 0) {
        container.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-secondary);">선택 가능한 다른 작업이 없습니다.</span>';
        return;
    }
    
    availableTasks.forEach(task => {
        const isChecked = selectedIds.includes(task.id) ? 'checked' : '';
        container.innerHTML += `
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #fff; cursor: pointer; user-select: none;">
                <input type="checkbox" name="prereq-checkbox" value="${task.id}" ${isChecked} style="width: 16px; height: 16px; accent-color: var(--accent-blue); cursor: pointer;">
                <span>${task.title} (${task.startTime} - ${task.endTime})</span>
            </label>
        `;
    });
}

// Open modal form for adding/editing tasks
function openTaskModal(editId = null) {
    const modal = document.getElementById("task-modal");
    const titleEl = document.getElementById("modal-title").querySelector("span");
    const form = document.getElementById("task-form");
    
    form.reset();
    
    if (editId !== null) {
        titleEl.textContent = "스케줄 수정";
        const task = activeTasks.find(t => t.id === Number(editId));
        if (task) {
            document.getElementById("task-id").value = task.id;
            document.getElementById("task-title").value = task.title;
            document.getElementById("task-starttime").value = task.startTime;
            document.getElementById("task-endtime").value = task.endTime;
            document.getElementById("task-location").value = task.location;
            document.getElementById("task-type").value = task.type;
            
            const selectedPrereqs = task.prerequisiteIds || [];
            populatePrerequisitesCheckboxes(editId, selectedPrereqs);
        }
    } else {
        titleEl.textContent = "새로운 스케줄 추가";
        document.getElementById("task-id").value = "";
        populatePrerequisitesCheckboxes(null, []);
    }
    
    modal.style.display = "flex";
}

// Close modal form
function closeTaskModal() {
    document.getElementById("task-modal").style.display = "none";
}

// Delete a task and cascade clean prerequisite references
function deleteTask(id) {
    activeTasks = activeTasks.filter(t => t.id !== id);
    activeTasks.forEach(t => {
        if (t.prerequisiteIds) {
            t.prerequisiteIds = t.prerequisiteIds.filter(pId => pId !== id);
        }
    });
    localStorage.setItem("activeTasksV6", JSON.stringify(activeTasks));
    renderOriginalTimeline();
    syncRealTimeAPIs();
}

// Modal Form Save event listener
document.getElementById("task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    
    const idVal = document.getElementById("task-id").value;
    const title = document.getElementById("task-title").value;
    const startTime = document.getElementById("task-starttime").value;
    const endTime = document.getElementById("task-endtime").value;
    const location = document.getElementById("task-location").value;
    const type = document.getElementById("task-type").value;
    
    // Read all checked prerequisite checkboxes
    const checkedBoxes = document.querySelectorAll('input[name="prereq-checkbox"]:checked');
    const prerequisiteIds = Array.from(checkedBoxes).map(cb => Number(cb.value));
    
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    
    if (startMin >= endMin) {
        alert("종료 시간은 시작 시간보다 늦어야 합니다.");
        return;
    }
    
    const duration = endMin - startMin;
    
    if (idVal) {
        const taskIndex = activeTasks.findIndex(t => t.id === Number(idVal));
        if (taskIndex !== -1) {
            activeTasks[taskIndex] = {
                ...activeTasks[taskIndex],
                title,
                startTime,
                endTime,
                duration,
                location,
                type,
                prerequisiteIds: prerequisiteIds
            };
        }
    } else {
        const newId = activeTasks.length > 0 ? Math.max(...activeTasks.map(t => t.id)) + 1 : 1;
        let icon = "calendar";
        if (type === "transport") icon = "truck";
        else if (type === "construction") icon = "anvil";
        else if (type === "outdoor") icon = "construction";
        else if (type === "indoor") icon = "shield-check";
        
        activeTasks.push({
            id: newId,
            title,
            startTime,
            endTime,
            duration,
            location,
            type,
            icon,
            prerequisiteIds: prerequisiteIds
        });
    }
    
    activeTasks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    localStorage.setItem("activeTasksV3", JSON.stringify(activeTasks));
    renderOriginalTimeline();
    syncRealTimeAPIs();
    closeTaskModal();
});

// Register modal buttons
document.getElementById("btn-add-task").addEventListener("click", () => {
    openTaskModal();
});
document.getElementById("modal-close").addEventListener("click", closeTaskModal);
document.getElementById("btn-modal-cancel").addEventListener("click", closeTaskModal);

// Main Scheduling Engine with Greedy Makespan Optimization (Order Swapping)
function runSchedulingEngine(apiLogs = []) {
    const logs = [...apiLogs]; // Prepend real-time API logs!
    
    // Environment condition multipliers/offsets
    const isRain = currentState.weather === "rain";
    const isSnow = currentState.weather === "snow";
    const isBusy = currentState.traffic === "busy";
    const isJammed = currentState.traffic === "jammed";
    const isAccident = currentState.incident === "accident";

    let scheduledTasks = [];
    let unscheduledTasks = JSON.parse(JSON.stringify(activeTasks));
    
    // 1. Calculate Environmental Ready Time & Adjusted Durations
    unscheduledTasks.forEach(task => {
        let envDelay = 0;
        let taskDuration = task.duration;
        let isSuspended = false;
        let reason = [];

        // Apply rules based on type and environment
        if (task.type === "transport") {
            if (isBusy) { envDelay += 30; reason.push("교통 혼잡 (+30분)"); }
            else if (isJammed) { envDelay += 60; reason.push("심각한 정체 (+60분)"); }
            if (isRain) { envDelay += 15; reason.push("우천 노면 감속 (+15분)"); }
            else if (isSnow) { envDelay += 40; reason.push("폭설 결빙 (+40분)"); }
            if (isAccident) { envDelay += 45; reason.push("인근 돌발 사고 (+45분)"); }
        }

        if (task.type === "construction") {
            if (isSnow) { isSuspended = true; reason.push("폭설 타설 불가 (보류)"); }
            else if (isRain) { taskDuration += 45; reason.push("우천 안전 확보 (+45분 소요)"); }
        }

        if (task.type === "outdoor") {
            if (isSnow) { isSuspended = true; reason.push("폭설 고공 작업 금지 (보류)"); }
            else if (isRain) { isSuspended = true; reason.push("우천 감전/추락 위험 (보류)"); }
        }

        task.isSuspended = isSuspended;
        task.taskDuration = taskDuration;
        task.envDelay = envDelay;
        task.reason = reason;
        
        // Base ready time is 09:00 + environmental delay
        task.envReadyTime = timeToMinutes("09:00") + envDelay;
    });

    let currentTime = timeToMinutes("09:00");
    
    // 2. Greedy Schedule Generation (Order Swapping)
    let cycleGuard = 0;
    while (unscheduledTasks.length > 0 && cycleGuard < 1000) {
        cycleGuard++;
        
        // Find eligible tasks (all prerequisiteIds are in scheduledTasks and not suspended)
        const eligibleTasks = unscheduledTasks.filter(t => {
            if (t.isSuspended) return true;
            if (!t.prerequisiteIds || t.prerequisiteIds.length === 0) return true;
            return t.prerequisiteIds.every(pId => {
                const prereq = scheduledTasks.find(st => st.id === Number(pId));
                return prereq && !prereq.isSuspended;
            });
        });
        
        if (eligibleTasks.length === 0) {
            // Unresolvable dependencies (cycle or missing prereq)
            unscheduledTasks.forEach(t => {
                t.isSuspended = true;
                t.reason.push("선행 과제 미해결로 인한 보류");
                scheduledTasks.push(t);
            });
            break;
        }

        // Check if any eligible task is already suspended or inherits suspension
        const suspendedTask = eligibleTasks.find(t => t.isSuspended || (t.prerequisiteIds && t.prerequisiteIds.some(pId => {
            const prereq = scheduledTasks.find(st => st.id === Number(pId));
            return prereq && prereq.isSuspended;
        })));

        if (suspendedTask) {
            suspendedTask.isSuspended = true;
            suspendedTask.finalStart = null;
            suspendedTask.finalEnd = null;
            if (!suspendedTask.reason.some(r => r.includes("보류"))) {
                suspendedTask.reason.push("선행 업무 보류로 인한 동반 보류");
            }
            scheduledTasks.push(suspendedTask);
            unscheduledTasks = unscheduledTasks.filter(t => t.id !== suspendedTask.id);
            continue;
        }

        // Calculate ActualReadyTime for eligible tasks
        eligibleTasks.forEach(t => {
            let maxPrereqEnd = 0;
            if (t.prerequisiteIds) {
                t.prerequisiteIds.forEach(pId => {
                    const prereq = scheduledTasks.find(st => st.id === Number(pId));
                    if (prereq && prereq.finalEnd > maxPrereqEnd) {
                        maxPrereqEnd = prereq.finalEnd;
                    }
                });
            }
            t.actualReadyTime = Math.max(currentTime, t.envReadyTime, maxPrereqEnd);
        });

        // Pick task that can start the earliest
        eligibleTasks.sort((a, b) => {
            if (a.actualReadyTime !== b.actualReadyTime) {
                return a.actualReadyTime - b.actualReadyTime;
            }
            // Tie-breaker: original start time to preserve natural order
            return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        });

        const nextTask = eligibleTasks[0];

        // Check for Sequence Flipping (Order Swapping Optimization)
        const skippedTask = eligibleTasks.find(t => t.id !== nextTask.id && timeToMinutes(t.startTime) < timeToMinutes(nextTask.startTime));
        if (skippedTask && nextTask.actualReadyTime < skippedTask.actualReadyTime) {
            // (User requested to remove the explicit reason text push here)
        }

        if (nextTask.actualReadyTime > currentTime) {
            // Gap / Idle time
            nextTask.reason.push(`선행 및 인프라 대기 (+${nextTask.actualReadyTime - currentTime}분)`);
        }

        // Schedule nextTask
        nextTask.finalStart = nextTask.actualReadyTime;
        nextTask.finalEnd = nextTask.finalStart + nextTask.taskDuration;
        currentTime = nextTask.finalEnd; // Advance global time resource
        
        scheduledTasks.push(nextTask);
        unscheduledTasks = unscheduledTasks.filter(t => t.id !== nextTask.id);
    }

    // 3. Format and Log
    const adjustedTasks = scheduledTasks.map(task => {
        let status = "normal";
        const origStart = timeToMinutes(task.startTime);
        
        if (task.isSuspended) {
            status = "suspended";
            logs.push(`⚠️ <strong>[${task.title}]</strong>: ${task.reason.join(", ")}`);
        } else {
            if (task.finalStart < origStart) {
                status = "advanced";
            } else if (task.finalStart > origStart || task.taskDuration > task.duration) {
                status = "delayed";
            }
            
            if (task.reason.length > 0) {
                logs.push(`🕒 <strong>[${task.title}]</strong>: ${task.reason.join(", ")}`);
            }
        }
        
        return {
            ...task,
            status: status,
            reasons: task.reason,
            actualDuration: task.taskDuration
        };
    });

    // Sort strictly by execution order for UI Timeline
    adjustedTasks.sort((a, b) => {
        if (a.finalStart === null && b.finalStart === null) return 0;
        if (a.finalStart === null) return 1;
        if (b.finalStart === null) return -1;
        return a.finalStart - b.finalStart;
    });

    renderAdjustedTimeline(adjustedTasks);
    generateAIExplanation(adjustedTasks, logs);
}

// Render Adjusted Timeline
function renderAdjustedTimeline(tasks) {
    // Sort tasks in chronological order for the adjusted output representation
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.status === "suspended" && b.status !== "suspended") return 1;
        if (a.status !== "suspended" && b.status === "suspended") return -1;
        if (a.status === "suspended" && b.status === "suspended") return a.id - b.id;
        return a.finalStart - b.finalStart;
    });

    adjustedTimeline.innerHTML = sortedTasks.map(task => {
        let statusBadge = "";
        let itemClass = "";
        let timeDisplay = "";

        if (task.status === "suspended") {
            itemClass = "delayed";
            statusBadge = `<span class="timeline-delay-badge" style="background: rgba(255,61,0,0.15); color: var(--accent-red); border-color: rgba(255,61,0,0.25);">작업 보류</span>`;
            timeDisplay = `<span style="color: var(--accent-red); text-decoration: line-through;">${task.startTime} - ${task.endTime}</span>`;
        } else if (task.status === "delayed") {
            itemClass = "delayed";
            const delayAmount = task.finalStart - timeToMinutes(task.startTime);
            statusBadge = `<span class="timeline-delay-badge">+${delayAmount}분 지연</span>`;
            timeDisplay = `<span>${minutesToTime(task.finalStart)} - ${minutesToTime(task.finalEnd)}</span>`;
        } else if (task.status === "advanced") {
            itemClass = "advanced";
            const advAmount = timeToMinutes(task.startTime) - task.finalStart;
            statusBadge = `<span class="timeline-delay-badge advanced-badge" style="background: rgba(0, 230, 118, 0.15); color: var(--accent-green); border-color: rgba(0, 230, 118, 0.25);">-${advAmount}분 조기 실행</span>`;
            timeDisplay = `<span style="color: var(--accent-green); font-weight: bold;">${minutesToTime(task.finalStart)} - ${minutesToTime(task.finalEnd)}</span>`;
        } else {
            itemClass = "completed-task";
            timeDisplay = `<span>${minutesToTime(task.finalStart)} - ${minutesToTime(task.finalEnd)}</span>`;
        }

        const reasonHTML = task.reasons.length > 0 
            ? `<div style="margin-top: 8px; font-size: 0.75rem; color: var(--accent-orange); display: flex; align-items: center; gap: 4px;">
                <i data-lucide="info" style="width: 12px; height: 12px;"></i> ${task.reasons.join(", ")}
               </div>`
            : "";

        const prereqList = (task.prerequisiteIds || []).map(pId => getTaskTitleById(pId)).filter(Boolean);
        const prereqBadge = prereqList.length > 0
            ? `<span style="font-size: 0.7rem; color: var(--accent-blue); background: rgba(0,242,254,0.08); padding: 1px 4px; border-radius: 3px; display: inline-flex; align-items: center; gap: 3px;"><i data-lucide="link" style="width: 10px; height: 10px;"></i>선행: ${prereqList.join(", ")}</span>`
            : "";

        return `
            <div class="timeline-item ${itemClass}">
                <div class="timeline-time">
                    ${timeDisplay}
                    <div style="display: flex; gap: 6px; align-items: center;">
                        ${statusBadge}
                        <span class="duration">${formatDuration(task.actualDuration)}</span>
                    </div>
                </div>
                <div class="timeline-title">${task.title}</div>
                <div class="timeline-meta" style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                    <span><i data-lucide="map-pin"></i> ${task.location}</span>
                    ${prereqBadge}
                </div>
                ${reasonHTML}
            </div>
        `;
    }).join("");
    lucide.createIcons();
}

// Simple markdown parser helper to render basic markdown inside the DOM
function parseMarkdown(md) {
    let html = md;
    
    // Escape HTML tags to prevent XSS but allow our own formatting
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Restore specific tags if needed (none are needed since we only convert markdown to tags)
    
    // Blockquotes
    html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote style="border-left: 3px solid var(--accent-blue); padding-left: 10px; margin: 10px 0; color: var(--text-secondary);">$1</blockquote>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Bullet points
    const lines = html.split('\n');
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('- ') || line.startsWith('* ')) {
            let content = line.substring(2);
            if (!inList) {
                lines[i] = '<ul style="margin-left: 20px; margin-bottom: 10px; list-style-type: disc;"><li>' + content + '</li>';
                inList = true;
            } else {
                lines[i] = '<li>' + content + '</li>';
            }
        } else {
            if (inList) {
                lines[i] = '</ul>' + lines[i];
                inList = false;
            }
        }
    }
    if (inList) {
        lines.push('</ul>');
    }
    html = lines.join('\n');
    
    // Headings
    html = html.replace(/^### (.*)/gm, '<h4 style="color: #fff; margin-top: 15px; margin-bottom: 8px; font-size: 1rem;">$1</h4>');
    html = html.replace(/^## (.*)/gm, '<h3 style="color: #fff; margin-top: 20px; margin-bottom: 10px; font-size: 1.1rem;">$1</h3>');
    html = html.replace(/^# (.*)/gm, '<h2 style="color: var(--accent-blue); margin-top: 20px; margin-bottom: 12px; font-size: 1.25rem;">$1</h2>');
    
    // Newlines to br
    html = html.replace(/\n/g, '<br>');
    // Clean up empty lines
    html = html.replace(/(<br>){2,}/g, '<br><br>');
    
    return html;
}

// Generate AI Explanation text
async function generateAIExplanation(tasks, logs) {
    const isRain = currentState.weather === "rain";
    const isSnow = currentState.weather === "snow";
    const isBusy = currentState.traffic === "busy";
    const isJammed = currentState.traffic === "jammed";
    const isAccident = currentState.incident === "accident";

    // Show loading state
    aiExplanationText.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; padding: 20px 0;">
            <div style="width: 24px; height: 24px; border: 2px solid var(--accent-blue); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <span style="font-size: 0.9rem; color: var(--accent-blue);">AI가 실시간 스케줄링 보고서를 분석하여 브리핑을 작성 중입니다...</span>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    try {
        const response = await fetch('/api/optimize', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                tasks: tasks,
                logs: logs.map(log => log.replace(/<\/?[^>]+(>|$)/g, ""))
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "백엔드 AI 분석 처리 실패");
        }

        const data = await response.json();
        aiExplanationText.innerHTML = parseMarkdown(data.explanation);
        lucide.createIcons();
        return;
    } catch (error) {
        console.error("AI Briefing fetch error:", error);
        logs.unshift(`❌ <strong>AI 엔진 브리핑 호출 실패</strong>: ${error.message} (로컬 시뮬레이션 브리핑으로 대체됩니다)`);
    }

    // --- FALLBACK STATIC SIMULATED AI BRiEFING ---
    let summaryText = "";
    let recommendation = "";

    // 1. Determine summary based on conditions
    if (isSnow) {
        summaryText = `<p>현재 대설 경보 및 극심한 한파 상황이 인식되었습니다. 안전 규정에 따라 야외 고공 및 액체 상태의 자재 작업(콘크리트 타설 등)은 전면 금지됩니다.</p>`;
        recommendation = `<p>💡 <strong>권고안:</strong> 실외 작업인 '콘크리트 타설' 및 '고공 구조물 정비'는 익일로 일정을 재배치하고, 즉시 현장 근로자를 실내 안전 대기 구역으로 인도하십시오. 실내 안전 점검 업무는 조기에 실행 가능합니다.</p>`;
    } else if (isRain) {
        summaryText = `<p>현재 강우가 관측되어 감전 및 추락 위험도가 대폭 상승했습니다. 현장 안전 수칙에 따라 야외 고난이도 고공 작업은 중단되며, 기상 상황에 맞게 자재 수송 및 기초 공사 일정이 자동 지연 조정되었습니다.</p>`;
        recommendation = `<p>💡 <strong>권고안:</strong> '실외 구조물 정비'는 강우 중단 시점 이후로 보류(연기) 처리하고, 콘크리트 타설은 수막 형성 방지를 위해 천막 보강막 설치 후 지연 진행하도록 조치하였습니다.</p>`;
    } else if (isJammed || isAccident) {
        summaryText = `<p>강남대로 인근 돌발 사고 또는 극심한 정체로 인해 원자재 보급 차선의 이동 소요 시간이 평소 대비 2배 이상 증가했습니다. 이에 연계 공정들의 대기 시간을 반영하여 전체 타임라인을 동적으로 재조정했습니다.</p>`;
        recommendation = `<p>💡 <strong>권고안:</strong> 자재 지연으로 인한 콘크리트 믹서트럭 대기 방지를 위해 타설 작업 조를 조정 배치 완료했습니다. 물류 차량 운전자에게 우회 경로 정보를 실시간 송출 중입니다.</p>`;
    } else if (isBusy) {
        summaryText = `<p>출퇴근 시간대 교통 혼잡으로 인해 물류 수송 일정이 약 30분 지연 처리되었습니다. 이후 공정은 대기 시간 마진 내에서 소화가 가능하여 전체 일정에 미치는 타격은 경미합니다.</p>`;
        recommendation = `<p>💡 <strong>권고안:</strong> 약 30분 수준의 지연으로 정상 마무리가 가능합니다. 타설팀은 기존대로 대기 바랍니다.</p>`;
    } else {
        summaryText = `<p>외부 환경 요인(기상, 교통, 돌발 사고) 분석 결과, 모든 지표가 '정상' 범주로 판별되었습니다. 사전 정의된 기준 일정 A안에 맞춰 차질 없이 작업을 수행할 것을 권고합니다.</p>`;
        recommendation = `<p>💡 <strong>권고안:</strong> 현재 표준 운영 절차에 따라 진행하십시오. 특이사항 발생 시 시스템이 즉각 모니터링하여 알림을 전달하겠습니다.</p>`;
    }

    // Combine output
    let logHTML = "";
    if (logs.length > 0) {
        logHTML = `
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed rgba(255,255,255,0.1);">
                <p style="font-weight: 600; margin-bottom: 8px; font-size: 0.85rem; color: var(--accent-blue);">[실시간 상황 인식 분석 세부 로그]</p>
                <ul style="list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: var(--text-secondary);">
                    ${logs.map(log => `<li>${log}</li>`).join("")}
                </ul>
            </div>
        `;
    }

    const envNotice = `
        <div class="ai-explanation-item" style="border-top: 1px dashed rgba(255,255,255,0.15); margin-top: 15px; padding-top: 10px; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="info" style="color: var(--accent-blue); width: 14px; height: 14px; flex-shrink:0;"></i>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">
                <strong>안내:</strong> 실시간 생성형 AI 브리핑을 연동하려면 <code>ai-scheduler/.env.local</code> 파일에 <code>GEMINI</code> API Key를 기입한 뒤 Node.js 서버를 구동하십시오.
            </span>
        </div>
    `;

    aiExplanationText.innerHTML = summaryText + recommendation + logHTML + envNotice;
    lucide.createIcons();
}

// Live Time Updater
function updateTime() {
    const now = new Date();
    const years = now.getFullYear();
    const months = String(now.getMonth() + 1).padStart(2, '0');
    const dates = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const day = dayNames[now.getDay()];

    liveTimeEl.textContent = `${years}. ${months}. ${dates} (${day}) ${hours}:${minutes}:${seconds}`;
}

// Setup Event Listeners for API refresh
function setupSimulator() {
    const btnRefresh = document.getElementById("btn-refresh-api");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", () => {
            btnRefresh.style.transform = "scale(0.95)";
            setTimeout(() => {
                btnRefresh.style.transform = "none";
            }, 100);
            syncRealTimeAPIs();
        });
    }
}

// Dynamic Icon & Passive Badge updates on status change
function updateIcons(type, value, extraInfo = "") {
    if (type === "weather") {
        const iconEl = document.getElementById("current-weather-icon");
        const badgeEl = document.getElementById("status-weather-badge");
        if (value === "clear") {
            iconEl.setAttribute("data-lucide", "sun");
            iconEl.parentElement.style.color = "var(--accent-blue)";
            badgeEl.textContent = "맑음";
            badgeEl.style.background = "rgba(0, 242, 254, 0.1)";
            badgeEl.style.color = "var(--accent-blue)";
        } else if (value === "rain") {
            iconEl.setAttribute("data-lucide", "cloud-rain");
            iconEl.parentElement.style.color = "var(--accent-orange)";
            badgeEl.textContent = "우천 (폭우)";
            badgeEl.style.background = "rgba(255, 110, 0, 0.1)";
            badgeEl.style.color = "var(--accent-orange)";
        } else if (value === "snow") {
            iconEl.setAttribute("data-lucide", "snowflake");
            iconEl.parentElement.style.color = "var(--accent-red)";
            badgeEl.textContent = "강설 (폭설)";
            badgeEl.style.background = "rgba(255, 61, 0, 0.1)";
            badgeEl.style.color = "var(--accent-red)";
        }
    } else if (type === "traffic") {
        const iconEl = document.getElementById("current-traffic-icon");
        const badgeEl = document.getElementById("status-traffic-badge");
        const countEl = document.getElementById("status-traffic-count");
        
        if (value === "normal") {
            iconEl.setAttribute("data-lucide", "car");
            iconEl.parentElement.style.color = "var(--accent-green)";
            badgeEl.textContent = "원활";
            badgeEl.style.background = "rgba(0, 230, 118, 0.1)";
            badgeEl.style.color = "var(--accent-green)";
        } else if (value === "busy") {
            iconEl.setAttribute("data-lucide", "car-front");
            iconEl.parentElement.style.color = "var(--accent-orange)";
            badgeEl.textContent = "혼잡";
            badgeEl.style.background = "rgba(255, 110, 0, 0.1)";
            badgeEl.style.color = "var(--accent-orange)";
        } else if (value === "jammed") {
            iconEl.setAttribute("data-lucide", "alert-circle");
            iconEl.parentElement.style.color = "var(--accent-red)";
            badgeEl.textContent = "정체";
            badgeEl.style.background = "rgba(255, 61, 0, 0.1)";
            badgeEl.style.color = "var(--accent-red)";
        }
        if (extraInfo) {
            countEl.textContent = `(집계: ${extraInfo})`;
        }
    } else if (type === "incident") {
        const iconEl = document.getElementById("current-alert-icon");
        const badgeEl = document.getElementById("status-alert-badge");
        if (value === "none") {
            iconEl.setAttribute("data-lucide", "shield-alert");
            iconEl.parentElement.style.color = "var(--accent-green)";
            badgeEl.textContent = "사고 없음";
            badgeEl.style.background = "rgba(0, 230, 118, 0.1)";
            badgeEl.style.color = "var(--accent-green)";
        } else if (value === "accident") {
            iconEl.setAttribute("data-lucide", "skull");
            iconEl.parentElement.style.color = "var(--accent-red)";
            badgeEl.textContent = "인근 사고 발생";
            badgeEl.style.background = "rgba(255, 61, 0, 0.1)";
            badgeEl.style.color = "var(--accent-red)";
        }
    }
    lucide.createIcons();
}

// Optimize Button Click Interaction (Manual override simulation & Refresh APIs)
btnOptimize.addEventListener("click", () => {
    btnOptimize.style.transform = "scale(0.95)";
    setTimeout(() => {
        btnOptimize.style.transform = "none";
    }, 100);
    
    // Quick loader effect
    const badge = document.getElementById("schedule-status-badge");
    badge.textContent = "최적화 분석 중...";
    badge.style.background = "rgba(0, 242, 254, 0.1)";
    badge.style.color = "var(--accent-blue)";
    
    setTimeout(() => {
        syncRealTimeAPIs();
    }, 600);
});

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
    renderOriginalTimeline();
    setupSimulator();
    
    // SPA navigation routing
    const navDashboard = document.getElementById("nav-dashboard");
    const navCalendar = document.getElementById("nav-calendar");
    
    if (navDashboard && navCalendar) {
        navDashboard.addEventListener("click", (e) => {
            e.preventDefault();
            navDashboard.classList.add("active");
            navCalendar.classList.remove("active");
            document.body.classList.remove("route-schedule");
        });
        
        navCalendar.addEventListener("click", (e) => {
            e.preventDefault();
            navCalendar.classList.add("active");
            navDashboard.classList.remove("active");
            document.body.classList.add("route-schedule");
        });
    }

    // Custom delete confirm modal listeners
    const btnConfirmCancel = document.getElementById("btn-confirm-cancel");
    const btnConfirmDelete = document.getElementById("btn-confirm-delete");
    const confirmModal = document.getElementById("confirm-modal");

    if (btnConfirmCancel && btnConfirmDelete && confirmModal) {
        btnConfirmCancel.addEventListener("click", () => {
            confirmModal.style.display = "none";
            pendingDeleteId = null;
        });

        btnConfirmDelete.addEventListener("click", () => {
            if (pendingDeleteId !== null) {
                deleteTask(pendingDeleteId);
                confirmModal.style.display = "none";
                pendingDeleteId = null;
            }
        });
    }

    // Live Time loop
    updateTime();
    setInterval(updateTime, 1000);

    // Initial load: fetch real-time public APIs automatically
    await syncRealTimeAPIs();
});

