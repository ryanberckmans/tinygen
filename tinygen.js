"use strict";

var md5 = require('MD5'); // Damn npm dependency, this isn't supposed to be a node project

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
// Returns a random integer between min (included) and max (excluded)
// Using Math.round() will give you a non-uniform distribution!
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

/*
    Goal

    Train a population of functions towards function(a,b) { return xa + yb; }

    ************************
    Experiment 1. (no code, failed)

    Candidate codified as parsable body of a function.
    All candidates share
        START = "function(a, b) { var c; "
        END   = "; return c; }"

    problem 1: fitness of child unrelated to parent
    problem 2: fitness indirectly related to distance from optimality
                    - unparsable candidate may be one character from optimal
                    - parseable candidates may be nearly optimal, but not assign c, or have an extraneous character, etc.

    ************************
    Experiment 2.

    Codify candidates as coefficients in the equation c = xa + yb, where candidate is [x,y].

    Code:
*/

function randomAtom() {
        return randomInt(0, 1000000);
}

function initialPopulation(size) {
    var population = [];
    for (var i = 0; i < size; i++) {
        population.push(randomCandidate());
    }

    return population;

    function randomCandidate() {
        return [randomAtom(), randomAtom()]
    }
}

var history = new Map();

// I should create a mapWrapper that accepts a hash function.
// I'd have to wrap at least delete(key), get(key), has(key), and set(key, value).
var toMapKey = function(o) {
    return md5(JSON.stringify(o));
}

var memoize = function(f, toMapKey) {
    var map = new Map();
    return function() {
        let key = toMapKey(arguments)
        let cached = map.get(key)
        if (cached) return cached;
        let computed = f.apply(this, arguments)
        map.set(key, computed)
        return computed
    }
}

// Lineage traverses the implicit family tree baked into the passed map,
// Returning an explicit family tree object
// Lineage is a memoized recursive function, so that successive calls for the same candidate return a cached subtree.
// Without memoization, lineage runs in O(2^iterations) time. 
// With memoization, it is O(iterations * population size), I think. Actually that is probably wrong, but it's a hell of a lot shorter.
var lineage = function(familyTree, toMapKey) {
    return function l1(c, work) {
        var memoize = new Map();
        false || function l2(candidate) { // without "false ||", l2 is treated as a function statement instead of a value. I tried wrapping it in () and v8 was still upset. Could also use "var dummy =", but false || makes this code unreadable, which I hear is cool
            var key = toMapKey(candidate)
            if (memoize.get(key)) return; // work already performed for candidate
            work(candidate)
            memoize.set(key, true) // infact, by setting memoized before recursing, memoization can avoid call cycles. But we have none, it's a tree.
            var parents = familyTree.get(key);
            if (parents === undefined) return;
            [parents.parent1, parents.parent2].map(function(parent) {
                // K so, if we recurse on "mutate" or "genesis", the static string will be memoized and work() won't be invoked but once for each.
                // Instead, we'll hackily inspect the value of each parent, and recurse unless static string.
                if (parent === 'mutate' || parent === 'genesis') {
                    work(parent)
                } else {
                    l2(parent)
                }
            })

        }(c);
        return undefined;
    }
}(history, toMapKey);

var parentage = function(familyTree, toMapKey) {
    return function(candidate, parent1, parent2) {
        var key = toMapKey(candidate)

         // You might consider throwing an exception if familyTree.get(key) pre-exists.
         // However, this can legitimately occur depending on toMapKey, breed, and crossover,
         // if the population stabilizes into an evolutionary cycle.
         // An evolutionary cycle would look like A -> B -> C -> A deterministic loop of parents/children.
         // So, an identical candidate is re-breeded every few generations, and re-hashed to the same key.
         // If toMapKey incorporated a unique Object id, an evolutionary cycle would be impossible, 
         // so long as breed() actually constructs new objects.
        if (familyTree.get(key) !== undefined) return null;

        familyTree.set(key, { parent1: parent1, parent2: parent2});
        return null;
    }
}(history, toMapKey);

function evaluate(population, fitness) {
    return population.map(function(candidate) {
        return {
            candidate: candidate,
            score: fitness(candidate)
        };
    }).sort(function(a,b) {
        if (a.score > b.score) {
            return 1;
        }
        if (a.score < b.score) {
            return -1;
        }
        return 0;
    });
}

function crossover(population, breed) {
    var bestCandidate = population.pop(); // assume population[population.length-1] is best candidate
    var children = population.map(function(candidate) {
        // tournament selection, breed bestCandidate with everybody in population
        var child = breed(bestCandidate, candidate);
        parentage(child, bestCandidate, candidate); // TODO parentage is a global :<
        return child;
    });
    children.push(bestCandidate);
    return children;
}

function breed(candidate1, candidate2) {
    return [
        Math.round((candidate1[0] + candidate2[0])/2),
        Math.round((candidate1[1] + candidate2[1])/2)
    ];
}

function mutate(population, chance, mutation) {
    for(let candidate of population) {
        var mutated = false;
        var originalCandidate = candidate.concat();
        if (Math.random() < chance) {
            let old = candidate[0];
            candidate[0] = mutation();
            console.log('mutate! original:' + originalCandidate + '. ' + old + ' --> ' + candidate[0]);
            mutated = true;
        }
        if (Math.random() < chance) {
            let old = candidate[1];
            candidate[1] = mutation();
            console.log('mutate! original:' + originalCandidate + '. ' + old + ' --> ' + candidate[1]);
            mutated = true;
        }
        if (mutated) {
            // console.log('mutated, new ' + candidate);
            // TODO this is probably a dumb flag, can do this with control flow
            parentage(candidate, 'mutate', originalCandidate)
        }
    }
}

function fitness(individual) {
    var individualFunction = function() {
        var aCoefficient = individual[0];
        var bCoefficient = individual[1];
        return function(aValue, bValue) { return aCoefficient * aValue + bCoefficient * bValue; };
    }();
    
    var TARGET_FUNCTION = function(a, b) { return 51837*a + 89123*b; };
    var TEST_DATA = [[1,2], [3,4], [10,20], [50, 100], [0.5, 0.75], [0, 10], [10, 0], [-5, 0], [0, -12], [-37, -48], [309038,-20938],[0, 238373], [398333,2], [111,99999]];

    var scores = TEST_DATA.map(function(s) {
        var score = 1.0 * individualFunction(s[0],s[1]) / TARGET_FUNCTION(s[0],s[1]);
        if (score > 1.0) {
            score = 1.0 / score;
        }
        return score;
    });

    var averageScore = scores.reduce(function(s,c) { return s + c; }, 0) / scores.length;
    
    return averageScore;
}

function run() {
    var rankedPopulation = evaluate(initialPopulation(10), fitness);

    rankedPopulation.map(function(c) { parentage(c.candidate, 'genesis', 'genesis') });

    console.log(JSON.stringify(rankedPopulation, null, 2));
    console.log('Running...');
    var iteration = 0;
    while (1) {
        console.log('iteration: ' + iteration + ' best: ' + JSON.stringify(rankedPopulation[rankedPopulation.length-1]));
        if (iteration > 10000 || rankedPopulation[rankedPopulation.length-1].score > 0.99999) {
            return rankedPopulation[rankedPopulation.length-1].candidate          
        }
        iteration += 1;
        var unrankedPopulation = crossover(rankedPopulation.map(function(c) { return c.candidate }), breed);
        mutate(unrankedPopulation, 0.02, randomAtom)
        rankedPopulation = evaluate(unrankedPopulation, fitness);
    }
}

// Ad-hoc lineage stats based on hardcoded values in family tree.
function stats(winner) {
    var mutations = 0
    var ancestors = 0

    lineage(winner, function(familyTreeNode) {
        if (familyTreeNode === 'mutate') {
             mutations += 1   
        } else if (familyTreeNode === 'genesis') {
            // no-op
        } else if (familyTreeNode !== 'genesis') {
            ancestors += 1
        } else {
            // what are you???
            throw familyTreeNode
        }
    })

    return {
        mutations: mutations,
        ancestors: ancestors
    }
}

var winner = run();

console.log('winner:' + winner)

console.log(JSON.stringify(stats(winner), null, 2))
