let graph = { nodes: [], edges: [] };
let steps = [], stepIndex = 0, isPlaying = false, intervalId = null, audioEnabled = true;
let synth = window.speechSynthesis, simulation;
let edgeInputCount = 0;

let selectedVoice = null;
speechSynthesis.onvoiceschanged = () => {
    let voices = synth.getVoices();
};

function updateFinalOrderBox(text) { document.getElementById('final-order').textContent = text || ''; }

class UnionFind {
    constructor(nodes) {
        this.parent = {};
        this.rank = {};
        this.edgeInfo = {};
        nodes.forEach(node => {
            this.parent[node] = node;
            this.rank[node] = 0;
            this.edgeInfo[node] = [];
        });
    }

    find(x) {
        if (this.parent[x] !== x) {
            this.parent[x] = this.find(this.parent[x]);
        }
        return this.parent[x];
    }

    union(x, y, edge) {
        const rootX = this.find(x);
        const rootY = this.find(y);
        
        if (rootX === rootY) return false;
        
        const mergedEdges = [...this.edgeInfo[rootX], ...this.edgeInfo[rootY], edge];
        
        if (this.rank[rootX] < this.rank[rootY]) {
            this.parent[rootX] = rootY;
            this.edgeInfo[rootY] = mergedEdges;
        } else if (this.rank[rootX] > this.rank[rootY]) {
            this.parent[rootY] = rootX;
            this.edgeInfo[rootX] = mergedEdges;
        } else {
            this.parent[rootY] = rootX;
            this.rank[rootX]++;
            this.edgeInfo[rootX] = mergedEdges;
        }
        return true;
    }

    getSetsWithEdges() {
        const sets = {};
        Object.keys(this.parent).forEach(node => {
            const root = this.find(node);
            if (!sets[root]) {
                sets[root] = {
                    nodes: [],
                    edges: this.edgeInfo[root] || []
                };
            }
            sets[root].nodes.push(node);
        });
        return Object.values(sets).map(set => ({
            nodes: set.nodes.sort(),
            edges: set.edges
        }));
    }
}

function renderEdgeList(edges, currentIndex = -1, acceptedEdges = []) {
    const container = document.getElementById('edge-list-container');
    container.innerHTML = '<div style="font-weight:bold; margin-bottom:6px; font-size:0.9em;">Sorted Edges</div>';
    
    edges.forEach((edge, idx) => {
        const div = document.createElement('div');
        div.className = 'edge-item';
        if (idx < currentIndex) {
            div.classList.add('processed');
        }
        if (idx === currentIndex) {
            div.classList.add('current');
        }
        if (acceptedEdges.some(e => 
            (e.source.id === edge.source.id && e.target.id === edge.target.id) ||
            (e.source.id === edge.target.id && e.target.id === edge.source.id)
        )) {
            div.classList.add('accepted');
        }
        div.innerHTML = `<span>${edge.source.id}-${edge.target.id}</span><span>W:${edge.weight}</span>`;
        container.appendChild(div);
    });
}

function renderUFHistory(index) {
    const historyContainer = document.getElementById('union-find-container');
    historyContainer.innerHTML = '';

    for (let i = 0; i <= index; i++) {
        const step = steps[i];
        if (!step.ufSets) continue;

        const ufStep = document.createElement('div');
        ufStep.className = 'uf-step';

        const label = document.createElement('div');
        label.className = 'uf-step-label';
        label.textContent = `Step ${i + 1}: ${step.desc}`;
        ufStep.appendChild(label);

        const setsDisplay = document.createElement('div');
        setsDisplay.className = 'uf-sets-display';

        const maxSlots = 5;
        const displaySets = step.ufSets.slice(0, maxSlots);
        const numEmpty = Math.max(0, maxSlots - displaySets.length);
        
        displaySets.forEach(set => {
            const setDiv = document.createElement('div');
            setDiv.className = 'uf-set';
            
            if (set.edges && set.edges.length > 0) {
                const edgeTexts = set.edges.map(e => 
                    `E:${e.source.id}-${e.target.id}, W=${e.weight}`
                );
                setDiv.innerHTML = edgeTexts.join('<br>');
            } else {
                setDiv.textContent = `{${set.nodes.join(',')}}`;
            }
            
            setsDisplay.appendChild(setDiv);
        });

        for (let j = 0; j < numEmpty; j++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'uf-set';
            emptyDiv.style.border = '1px dashed #cccccc';
            emptyDiv.style.background = '#ffffff';
            setsDisplay.appendChild(emptyDiv);
        }

        ufStep.appendChild(setsDisplay);
        historyContainer.appendChild(ufStep);
    }

    historyContainer.scrollTop = historyContainer.scrollHeight;
}

function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const value = parseFloat(slider.value);
    const percentage = ((value - min) / (max - min)) * 100;

    slider.style.background = `linear-gradient(to right, #292966 ${percentage}%, #ddd ${percentage}%)`;
}

function generateNodes() {
    const num = parseInt(document.getElementById('num-nodes').value);
    if (!(num >= 1 && num <= 20)) { alert('Nodes must be 1–20'); return; }
    const labels = Array.from({ length: num }, (_, i) => (i + 1).toString());
    graph.nodes = labels.map(l => ({ id: l, x: 150 + Math.random() * 600, y: 100 + Math.random() * 350 }));
    graph.edges = []; 
    document.getElementById('edge-list').innerHTML = ''; 
    edgeInputCount = 0;
    renderGraph(); 
    document.getElementById('step-text').textContent = `Nodes generated: ${labels.join(', ')}.\nAdd weighted edges manually then Build & Run.`;
    updateFinalOrderBox('');
    document.getElementById('edge-list-container').innerHTML = '';
    document.getElementById('union-find-container').innerHTML = '';
}

function addEdgeInput() {
    edgeInputCount++;
    const div = document.createElement('div'); 
    div.className = 'edge-input';
    div.innerHTML = `Edge ${edgeInputCount}: From <input maxlength="2" placeholder="From"> ↔ To <input maxlength="2" placeholder="To"> Weight <input type="number" min="1" placeholder="W" style="width:50px;"> <button onclick="this.parentElement.remove()">Remove</button>`;
    document.getElementById('edge-list').appendChild(div);
}

function buildGraph() {
    if (!graph.nodes.length) { alert('Generate nodes first'); return; }

    graph.edges = [];
    document.querySelectorAll('#edge-list .edge-input').forEach(div => {
        const inputs = div.querySelectorAll('input');
        const from = (inputs[0]?.value || '').toUpperCase();
        const to = (inputs[1]?.value || '').toUpperCase();
        const weight = parseInt(inputs[2]?.value || '0');
        
        if (graph.nodes.map(n => n.id).includes(from) && 
            graph.nodes.map(n => n.id).includes(to) && 
            from !== to && weight > 0) {
            const s = graph.nodes.find(n => n.id === from);
            const t = graph.nodes.find(n => n.id === to);
            graph.edges.push({ source: s, target: t, weight: weight });
        }
    });

    if (graph.edges.length === 0) {
        alert('Please add at least one valid edge with weight');
        return;
    }

    document.getElementById('edge-list-container').style.display = 'flex';

    renderGraph();
    steps = []; 
    stepIndex = 0; 
    document.getElementById('step-text').textContent = '';
    updateFinalOrderBox('');
    document.getElementById('step-text').textContent = `Graph built. Running Kruskal's algorithm...\n\n`;
    kruskalMST();
    
    stepIndex = 0;
    highlightStep(stepIndex);
}

function renderGraph() {
    const svg = d3.select('#graph-svg');
    svg.selectAll('*').remove();

    const link = svg.selectAll('.edge-path').data(graph.edges)
        .enter().append('line')
        .attr('class', 'edge-path')
        .attr('stroke', '#9aa0a6')
        .attr('stroke-width', 2);

    const edgeLabels = svg.selectAll('.edge-weight').data(graph.edges)
        .enter().append('text')
        .attr('class', 'edge-weight')
        .text(d => d.weight);

    const node = svg.selectAll('.node').data(graph.nodes)
        .enter().append('g')
        .attr('class', 'node')
        .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

    node.append('circle').attr('r', 20).attr('fill', '#292966');
    node.append('text').text(d => d.id).attr('dy', 0).attr('dx', 0);

    if (simulation) simulation.stop();
    simulation = d3.forceSimulation(graph.nodes)
        .force('link', d3.forceLink(graph.edges).id(d => d.id).distance(140))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(svg.node().clientWidth / 2, svg.node().clientHeight / 2))
        .on('tick', () => {
            link.attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            edgeLabels
                .attr('x', d => (d.source.x + d.target.x) / 2)
                .attr('y', d => (d.source.y + d.target.y) / 2);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
}

function dragstarted(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragended(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

function kruskalMST() {
    const sortedEdges = [...graph.edges].sort((a, b) => a.weight - b.weight);
    const uf = new UnionFind(graph.nodes.map(n => n.id));
    const mstEdges = [];
    let totalCost = 0;

    steps = [];

    // Initial step: Mark all edges as Status 1 (Not yet considered)
    steps.push({
        edge: null,
        desc: `Start Kruskal's algorithm. Mark all edges as Status 1 (Not yet considered). Sort all edges by ascending weight.`,
        sortedEdges: sortedEdges,
        currentEdgeIndex: -1,
        mstEdges: [],
        ufSets: uf.getSetsWithEdges()
    });

    sortedEdges.forEach((edge, index) => {
        const u = edge.source.id;
        const v = edge.target.id;

        // Step: Considering edge
        steps.push({
            edge: edge,
            desc: `Consider edge (${u}-${v}) with weight ${edge.weight}. Set Status 2 (Checking for cycle).`,
            sortedEdges: sortedEdges,
            currentEdgeIndex: index,
            mstEdges: [...mstEdges],
            ufSets: uf.getSetsWithEdges(),
            considering: true
        });

        if (uf.find(u) !== uf.find(v)) {
            // Accept edge
            uf.union(u, v, edge);
            mstEdges.push(edge);
            totalCost += edge.weight;

            steps.push({
                edge: edge,
                desc: `Edge (${u}-${v}) does not form a cycle. Set Status 3 (Accepted to MST). Total cost now: ${totalCost}`,
                sortedEdges: sortedEdges,
                currentEdgeIndex: index,
                mstEdges: [...mstEdges],
                ufSets: uf.getSetsWithEdges(),
                accepted: true
            });
        } else {
            // Reject edge
            steps.push({
                edge: edge,
                desc: `Edge (${u}-${v}) forms a cycle. Set Status 4 (Rejected).`,
                sortedEdges: sortedEdges,
                currentEdgeIndex: index,
                mstEdges: [...mstEdges],
                ufSets: uf.getSetsWithEdges(),
                rejected: true
            });
        }
    });

    // Final Step
    steps.push({
        edge: null,
        desc: `Kruskal's algorithm complete. MST constructed with ${mstEdges.length} edges. Final total cost: ${totalCost}`,
        sortedEdges: sortedEdges,
        currentEdgeIndex: sortedEdges.length,
        mstEdges: [...mstEdges],
        ufSets: uf.getSetsWithEdges()
    });

    updateFinalOrderBox(`MST Total Cost: ${totalCost} | Edges in MST: ${mstEdges.length}`);
}

function highlightStep(index) {
    if (index < 0 || index >= steps.length) return;
    const svg = d3.select('#graph-svg');
    svg.selectAll('.node circle').attr('fill', '#292966');
    svg.selectAll('.edge-path').classed('mst', false).classed('considering', false)
        .attr('stroke', '#9aa0a6').attr('stroke-width', 2);

    const currentStep = steps[index];

    if (currentStep.mstEdges) {
        currentStep.mstEdges.forEach(edge => {
            svg.selectAll('.edge-path')
                .filter(d => (d.source.id === edge.source.id && d.target.id === edge.target.id) ||
                            (d.source.id === edge.target.id && d.target.id === edge.source.id))
                .classed('mst', true).attr('stroke', '#088a3a').attr('stroke-width', 4);
        });
    }

    if (currentStep.edge && currentStep.considering) {
        svg.selectAll('.edge-path')
            .filter(d => (d.source.id === currentStep.edge.source.id && d.target.id === currentStep.edge.target.id) ||
                        (d.source.id === currentStep.edge.target.id && d.target.id === currentStep.edge.source.id))
            .classed('considering', true).attr('stroke', '#e9e218').attr('stroke-width', 3);
    }

    document.getElementById('step-text').textContent = steps.slice(0, index + 1).map(s => s.desc).join('\n\n');

    if (currentStep.sortedEdges) {
        renderEdgeList(currentStep.sortedEdges, currentStep.currentEdgeIndex, currentStep.mstEdges);
    }

    renderUFHistory(index);
}

function speakCurrentStep(onEndCallback) {
    if (!audioEnabled || !('speechSynthesis' in window)) {
        if (typeof onEndCallback === 'function') onEndCallback();
        return;
    }
    const text = steps[stepIndex] ? steps[stepIndex].desc : '';
    if (!text) {
        if (typeof onEndCallback === 'function') onEndCallback();
        return;
    }
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utt.voice = selectedVoice;
    utt.rate = parseFloat(document.getElementById('speech-rate').value || '0.8');
    utt.onend = () => { if (typeof onEndCallback === 'function') onEndCallback(); };
    synth.speak(utt);
}

function playPause() {
    const playBtn = document.getElementById('play-pause');
    if (isPlaying) {
        isPlaying = false;
        playBtn.textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
        return;
    }

    isPlaying = true;
    playBtn.textContent = 'Pause';

    highlightStep(stepIndex);
    speakCurrentStep(() => {
        if (!isPlaying) return;
        const next = function () {
            if (!isPlaying) return;
            if (stepIndex < steps.length - 1) {
                stepIndex++;
                highlightStep(stepIndex);
                speakCurrentStep(next);
            } else {
                isPlaying = false;
                document.getElementById('play-pause').textContent = 'Play';
            }
        };
        next();
    });
}

function stepForward() {
    if (isPlaying) {
        isPlaying = false; 
        document.getElementById('play-pause').textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
    }
    if (stepIndex < steps.length - 1) stepIndex++;
    highlightStep(stepIndex);
    speakCurrentStep();
}

function stepBackward() {
    if (isPlaying) {
        isPlaying = false; 
        document.getElementById('play-pause').textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
    }
    if (stepIndex > 0) stepIndex--;
    highlightStep(stepIndex);
    speakCurrentStep();
}

function clearGraph() {
    if (simulation) { simulation.stop(); simulation = null; }
    graph.nodes = []; 
    graph.edges = []; 
    steps = []; 
    stepIndex = 0; 
    edgeInputCount = 0;
    document.getElementById('edge-list').innerHTML = '';
    document.getElementById('step-text').textContent = '';
    updateFinalOrderBox('');
    d3.select('#graph-svg').selectAll('*').remove();
    document.getElementById('edge-list-container').innerHTML = '';
    document.getElementById('edge-list-container').style.display = 'none';
    document.getElementById('union-find-container').innerHTML = '';
}

window.addEventListener('resize', () => {
    if (simulation) {
        const svg = d3.select('#graph-svg');
        simulation.force('center', d3.forceCenter(svg.node().clientWidth / 2, svg.node().clientHeight / 2));
        simulation.alpha(0.5).restart();
    }
});
