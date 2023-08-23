import QuickChart from 'quickchart-js';
import { getGradeColor } from './index.js';

// ============================== Chart ==============================

class Chart {

    constructor() {}

    createGraph(graph) {
        let timestamps = [];
        let rankValues = [];
        for (let i = 0; i < graph.length; i++) {
            timestamps.push(new Date(graph[i].timestamp).toLocaleDateString("fr-FR", { timeZone: 'Europe/Paris', month: 'short', day: 'numeric' }).toString());
            rankValues.push(graph[i].rank);
        }

        // Création du graphique
        const chart = {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    {
                        fill: false,
                        borderColor: QuickChart.getGradientFillHelper('vertical', ['#ffffff', '#6DD5FA', '#1c92d2']),
                        borderWidth: 5,
                        pointRadius: 0,
                        data: rankValues
                    }
                ]
            },
            options: {
                legend: {
                    display: false
                },
                scales: {
                    yAxes: [{
                        ticks: {
                            reverse: true,
                            callback: (val) => {
                                return '#' + val.toLocaleString();
                            },
                        }
                    }]
                }
            }
        };
        const quickgraph = new QuickChart()
        quickgraph.setConfig(chart)
            .setBackgroundColor('transparent')
            .setWidth(500)
            .setHeight(300);

        return quickgraph;
    }

    createSessionGraph(modes, performances, grades, difficulties, accuracies) {
        /*console.log("===== DEBUG =====");
        console.log(modes);
        console.log("Total scores: "+performances.length);
        console.log(this.getModeColor(modes));
        console.log("=================");*/
        let labels = [];
        for (let i = 0; i < performances.length; i++) {
            labels.push(i + 1);
        }

        const chart = {
            "type": "line",
            "data": {
                "labels": labels,
                "datasets": [
                    {
                        "label": "Performance (PR)",
                        "yAxisID": "Y1",
                        "type": "scatter",
                        "fill": false,
                        "pointBorderWidth": 1,
                        "pointRadius": 5,
                        "borderColor": this.getModeColor(modes),
                        "backgroundColor": this.getScoreColor(grades),
                        "data": performances,
                    },
                    {
                        "label": "Map Difficulty",
                        "yAxisID": "Y1",
                        "pointStyle": "line",
                        "fill": false,
                        "pointRadius": 0,
                        "borderColor": "rgba(233,183,54, 1)",
                        "data": difficulties,
                    },
                    {
                        "label": "Accuracy",
                        "yAxisID": "Y2",
                        "pointStyle": "line",
                        "fill": false,
                        "pointRadius": 0,
                        "borderColor": "rgba(211,211,211, 0.5)",
                        "backgroundColor": "rgba(211,211,211, 0.5)",
                        "data": accuracies,
                    },
                ],
            },
            "options": {
                "scales": {
                    "yAxes": [
                        {
                            "id": "Y2",
                            "position": "right",
                            "ticks": {
                                "beginAtZero": false,
                                "fontFamily": "sans-serif",
                                "fontColor": "#fff",
                                "callback": (val) => {
                                    return val.toLocaleString()+"%";
                                },
                            },
                        },
                        {
                            "id": "Y1",
                            "ticks": {
                                "beginAtZero": false,
                                "fontFamily": "sans-serif",
                                "fontColor": "#fff",
                            },
                        },
                    ]
                },
                "legend": {
                    "labels": {
                        "usePointStyle": true,
                        "boxWidth": 8,
                        "fontColor": "#fff",
                        "fontFamily": "sans-serif",
                        "fontSize": 15,
                    }
                }
            }
        }

        const quickgraph = new QuickChart()
        quickgraph.setConfig(chart)
            .setBackgroundColor('transparent')
            .setWidth(500)
            .setHeight(300);

        return quickgraph;
    }

    getScoreColor(grades) {
        let colors = [];
        grades.forEach((grade) => {
            colors.push(getGradeColor(grade));
        })
        return colors;
    }

    getModeColor(modes) {
        let colors = [];
        modes.forEach((mode) => {
            let color;
            mode == 1 ? color = "rgba(5, 135, 229, 1)" : color = "rgba(155, 81, 224, 1)";
            colors.push(color);
        })
        return colors;
    }
}

export default new Chart();