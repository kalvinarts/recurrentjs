let R = {}; // the Recurrent library

(function(global) {
  "use strict";

  // Utility fun
  function assert(condition, message) {
    // from http://stackoverflow.com/questions/15313418/javascript-assert
    if (!condition) {
      message = message || "Assertion failed";
      if (typeof Error !== "undefined") {
        throw new Error(message);
      }
      throw message; // Fallback
    }
  }

  // Random numbers utils
  let return_v = false;
  let v_val = 0.0;
  const gaussRandom = function() {
    if(return_v) { 
      return_v = false;
      return v_val; 
    }
    let u = 2*Math.random()-1;
    let v = 2*Math.random()-1;
    let r = u*u + v*v;
    if(r == 0 || r > 1) return gaussRandom();
    let c = Math.sqrt(-2*Math.log(r)/r);
    v_val = v*c; // cache this
    return_v = true;
    return u*c;
  }
  const randf = function(a, b) { return Math.random()*(b-a)+a; }
  const randi = function(a, b) { return Math.floor(Math.random()*(b-a)+a); }
  const randn = function(mu, std){ return mu+gaussRandom()*std; }

  // helper function returns array of zeros of length n
  // and uses typed arrays if available
  const zeros = function(n) {
    if(typeof(n)==='undefined' || isNaN(n)) { return []; }
    if(typeof ArrayBuffer === 'undefined') {
      // lacking browser support
      let arr = new Array(n);
      for(let i=0;i<n;i++) { arr[i] = 0; }
      return arr;
    } else {
      return new Float64Array(n);
    }
  }

  // Mat holds a matrix
  const Mat = function(n,d) {
    // n is number of rows d is number of columns
    this.n = n;
    this.d = d;
    this.w = zeros(n * d);
    this.dw = zeros(n * d);
  }
  Mat.prototype = {
    get: function(row, col) { 
      // slow but careful accessor function
      // we want row-major order
      let ix = (this.d * row) + col;
      assert(ix >= 0 && ix < this.w.length);
      return this.w[ix];
    },
    set: function(row, col, v) {
      // slow but careful accessor function
      let ix = (this.d * row) + col;
      assert(ix >= 0 && ix < this.w.length);
      this.w[ix] = v; 
    },
    toJSON: function() {
      let json = {};
      json['n'] = this.n;
      json['d'] = this.d;
      json['w'] = this.w;
      return json;
    },
    fromJSON: function(json) {
      this.n = json.n;
      this.d = json.d;
      this.w = zeros(this.n * this.d);
      this.dw = zeros(this.n * this.d);
      for(let i=0,n=this.n * this.d;i<n;i++) {
        this.w[i] = json.w[i]; // copy over weights
      }
    }
  }

  // return Mat but filled with random numbers from gaussian
  const RandMat = function(n,d,mu,std) {
    let m = new Mat(n, d);
    //fillRandn(m,mu,std);
    fillRand(m,-std,std); // kind of :P
    return m;
  }

  // Mat utils
  // fill matrix with random gaussian numbers
  const fillRandn = function(m, mu, std) { for(let i=0,n=m.w.length;i<n;i++) { m.w[i] = randn(mu, std); } }
  const fillRand = function(m, lo, hi) { for(let i=0,n=m.w.length;i<n;i++) { m.w[i] = randf(lo, hi); } }

  // Transformer definitions
  const Graph = function(needs_backprop) {
    if(typeof needs_backprop === 'undefined') { needs_backprop = true; }
    this.needs_backprop = needs_backprop;

    // this will store a list of functions that perform backprop,
    // in their forward pass order. So in backprop we will go
    // backwards and evoke each one
    this.backprop = [];
  }
  Graph.prototype = {
    backward: function() {
      for(let i=this.backprop.length-1;i>=0;i--) {
        this.backprop[i](); // tick!
      }
    },
    rowPluck: function(m, ix) {
      // pluck a row of m with index ix and return it as col vector
      assert(ix >= 0 && ix < m.n);
      let d = m.d;
      let out = new Mat(d, 1);
      for(let i=0,n=d;i<n;i++){ out.w[i] = m.w[d * ix + i]; } // copy over the data

      if(this.needs_backprop) {
        const backward = function() {
          for(let i=0,n=d;i<n;i++){ m.dw[d * ix + i] += out.dw[i]; }
        }
        this.backprop.push(backward);
      }
      return out;
    },
    tanh: function(m) {
      // tanh nonlinearity
      let out = new Mat(m.n, m.d);
      let n = m.w.length;
      for(let i=0;i<n;i++) { 
        out.w[i] = Math.tanh(m.w[i]);
      }

      if(this.needs_backprop) {
        const backward = function() {
          for(let i=0;i<n;i++) {
            // grad for z = tanh(x) is (1 - z^2)
            let mwi = out.w[i];
            m.dw[i] += (1.0 - mwi * mwi) * out.dw[i];
          }
        }
        this.backprop.push(backward);
      }
      return out;
    },
    sigmoid: function(m) {
      // sigmoid nonlinearity
      let out = new Mat(m.n, m.d);
      let n = m.w.length;
      for(let i=0;i<n;i++) { 
        out.w[i] = sig(m.w[i]);
      }

      if(this.needs_backprop) {
        const backward = function() {
          for(let i=0;i<n;i++) {
            // grad for z = tanh(x) is (1 - z^2)
            let mwi = out.w[i];
            m.dw[i] += mwi * (1.0 - mwi) * out.dw[i];
          }
        }
        this.backprop.push(backward);
      }
      return out;
    },
    relu: function(m) {
      let out = new Mat(m.n, m.d);
      let n = m.w.length;
      for(let i=0;i<n;i++) { 
        out.w[i] = Math.max(0, m.w[i]); // relu
      }
      if(this.needs_backprop) {
        const backward = function() {
          for(let i=0;i<n;i++) {
            m.dw[i] += m.w[i] > 0 ? out.dw[i] : 0.0;
          }
        }
        this.backprop.push(backward);
      }
      return out;
    },
    mul: function(m1, m2) {
      // multiply matrices m1 * m2
      assert(m1.d === m2.n, 'matmul dimensions misaligned');

      let n = m1.n;
      let d = m2.d;
      let out = new Mat(n,d);
      for(let i=0;i<m1.n;i++) { // loop over rows of m1
        for(let j=0;j<m2.d;j++) { // loop over cols of m2
          let dot = 0.0;
          for(let k=0;k<m1.d;k++) { // dot product loop
            dot += m1.w[m1.d*i+k] * m2.w[m2.d*k+j];
          }
          out.w[d*i+j] = dot;
        }
      }

      if(this.needs_backprop) {
        const backward = function() {
          for(let i=0;i<m1.n;i++) { // loop over rows of m1
            for(let j=0;j<m2.d;j++) { // loop over cols of m2
              for(let k=0;k<m1.d;k++) { // dot product loop
                let b = out.dw[d*i+j];
                m1.dw[m1.d*i+k] += m2.w[m2.d*k+j] * b;
                m2.dw[m2.d*k+j] += m1.w[m1.d*i+k] * b;
              }
            }
          }
        }
        this.backprop.push(backward);
      }
      return out;
    },
    add: function(m1, m2) {
      assert(m1.w.length === m2.w.length);

      let out = new Mat(m1.n, m1.d);
      for(let i=0,n=m1.w.length;i<n;i++) {
        out.w[i] = m1.w[i] + m2.w[i];
      }
      if(this.needs_backprop) {
        const backward = function() {
          for(let i=0,n=m1.w.length;i<n;i++) {
            m1.dw[i] += out.dw[i];
            m2.dw[i] += out.dw[i];
          }
        }
        this.backprop.push(backward);
      }
      return out;
    },
    eltmul: function(m1, m2) {
      assert(m1.w.length === m2.w.length);

      let out = new Mat(m1.n, m1.d);
      for(let i=0,n=m1.w.length;i<n;i++) {
        out.w[i] = m1.w[i] * m2.w[i];
      }
      if(this.needs_backprop) {
        const backward = function() {
          for(let i=0,n=m1.w.length;i<n;i++) {
            m1.dw[i] += m2.w[i] * out.dw[i];
            m2.dw[i] += m1.w[i] * out.dw[i];
          }
        }
        this.backprop.push(backward);
      }
      return out;
    },
  }

  const softmax = function(m) {
      let out = new Mat(m.n, m.d); // probability volume
      let maxval = -999999;
      for(let i=0,n=m.w.length;i<n;i++) { if(m.w[i] > maxval) maxval = m.w[i]; }

      let s = 0.0;
      for(let i=0,n=m.w.length;i<n;i++) { 
        out.w[i] = Math.exp(m.w[i] - maxval);
        s += out.w[i];
      }
      for(let i=0,n=m.w.length;i<n;i++) { out.w[i] /= s; }

      // no backward pass here needed
      // since we will use the computed probabilities outside
      // to set gradients directly on m
      return out;
    }

  const Solver = function() {
    this.decay_rate = 0.999;
    this.smooth_eps = 1e-8;
    this.step_cache = {};
  }
  Solver.prototype = {
    step: function(model, step_size, regc, clipval) {
      // perform parameter update
      let solver_stats = {};
      let num_clipped = 0;
      let num_tot = 0;
      for(let k in model) {
        if(model.hasOwnProperty(k)) {
          let m = model[k]; // mat ref
          if(!(k in this.step_cache)) { this.step_cache[k] = new Mat(m.n, m.d); }
          let s = this.step_cache[k];
          for(let i=0,n=m.w.length;i<n;i++) {

            // rmsprop adaptive learning rate
            let mdwi = m.dw[i];
            s.w[i] = s.w[i] * this.decay_rate + (1.0 - this.decay_rate) * mdwi * mdwi;

            // gradient clip
            if(mdwi > clipval) {
              mdwi = clipval;
              num_clipped++;
            }
            if(mdwi < -clipval) {
              mdwi = -clipval;
              num_clipped++;
            }
            num_tot++;

            // update (and regularize)
            m.w[i] += - step_size * mdwi / Math.sqrt(s.w[i] + this.smooth_eps) - regc * m.w[i];
            m.dw[i] = 0; // reset gradients for next iteration
          }
        }
      }
      solver_stats['ratio_clipped'] = num_clipped*1.0/num_tot;
      return solver_stats;
    }
  }

  const initLSTM = function(input_size, hidden_sizes, output_size) {
    // hidden size should be a list

    let model = {};
    for(let d=0;d<hidden_sizes.length;d++) { // loop over depths
      let prev_size = d === 0 ? input_size : hidden_sizes[d - 1];
      let hidden_size = hidden_sizes[d];

      // gates parameters
      model['Wix'+d] = new RandMat(hidden_size, prev_size , 0, 0.08);  
      model['Wih'+d] = new RandMat(hidden_size, hidden_size , 0, 0.08);
      model['bi'+d] = new Mat(hidden_size, 1);
      model['Wfx'+d] = new RandMat(hidden_size, prev_size , 0, 0.08);  
      model['Wfh'+d] = new RandMat(hidden_size, hidden_size , 0, 0.08);
      model['bf'+d] = new Mat(hidden_size, 1);
      model['Wox'+d] = new RandMat(hidden_size, prev_size , 0, 0.08);  
      model['Woh'+d] = new RandMat(hidden_size, hidden_size , 0, 0.08);
      model['bo'+d] = new Mat(hidden_size, 1);
      // cell write params
      model['Wcx'+d] = new RandMat(hidden_size, prev_size , 0, 0.08);  
      model['Wch'+d] = new RandMat(hidden_size, hidden_size , 0, 0.08);
      model['bc'+d] = new Mat(hidden_size, 1);
    }
    // decoder params
    model['Whd'] = new RandMat(output_size, hidden_size, 0, 0.08);
    model['bd'] = new Mat(output_size, 1);
    return model;
  }

  const forwardLSTM = function(G, model, hidden_sizes, x, prev) {
    // forward prop for a single tick of LSTM
    // G is graph to append ops to
    // model contains LSTM parameters
    // x is 1D column vector with observation
    // prev is a struct containing hidden and cell
    // from previous iteration

    if(typeof prev.h === 'undefined') {
      let hidden_prevs = [];
      let cell_prevs = [];
      for(let d=0;d<hidden_sizes.length;d++) {
        hidden_prevs.push(new R.Mat(hidden_sizes[d],1)); 
        cell_prevs.push(new R.Mat(hidden_sizes[d],1)); 
      }
    } else {
      let hidden_prevs = prev.h;
      let cell_prevs = prev.c;
    }

    let hidden = [];
    let cell = [];
    for(let d=0;d<hidden_sizes.length;d++) {

      let input_vector = d === 0 ? x : hidden[d-1];
      let hidden_prev = hidden_prevs[d];
      let cell_prev = cell_prevs[d];

      // input gate
      let h0 = G.mul(model['Wix'+d], input_vector);
      let h1 = G.mul(model['Wih'+d], hidden_prev);
      let input_gate = G.sigmoid(G.add(G.add(h0,h1),model['bi'+d]));

      // forget gate
      let h2 = G.mul(model['Wfx'+d], input_vector);
      let h3 = G.mul(model['Wfh'+d], hidden_prev);
      let forget_gate = G.sigmoid(G.add(G.add(h2, h3),model['bf'+d]));

      // output gate
      let h4 = G.mul(model['Wox'+d], input_vector);
      let h5 = G.mul(model['Woh'+d], hidden_prev);
      let output_gate = G.sigmoid(G.add(G.add(h4, h5),model['bo'+d]));

      // write operation on cells
      let h6 = G.mul(model['Wcx'+d], input_vector);
      let h7 = G.mul(model['Wch'+d], hidden_prev);
      let cell_write = G.tanh(G.add(G.add(h6, h7),model['bc'+d]));

      // compute new cell activation
      let retain_cell = G.eltmul(forget_gate, cell_prev); // what do we keep from cell
      let write_cell = G.eltmul(input_gate, cell_write); // what do we write to cell
      let cell_d = G.add(retain_cell, write_cell); // new cell contents

      // compute hidden state as gated, saturated cell activations
      let hidden_d = G.eltmul(output_gate, G.tanh(cell_d));

      hidden.push(hidden_d);
      cell.push(cell_d);
    }

    // one decoder to outputs at end
    let output = G.add(G.mul(model['Whd'], hidden[hidden.length - 1]),model['bd']);

    // return cell memory, hidden representation and output
    return {'h':hidden, 'c':cell, 'o' : output};
  }

  const initRNN = function(input_size, hidden_sizes, output_size) {
    // hidden size should be a list

    let model = {};
    for(let d=0;d<hidden_sizes.length;d++) { // loop over depths
      let prev_size = d === 0 ? input_size : hidden_sizes[d - 1];
      let hidden_size = hidden_sizes[d];
      model['Wxh'+d] = new R.RandMat(hidden_size, prev_size , 0, 0.08);
      model['Whh'+d] = new R.RandMat(hidden_size, hidden_size, 0, 0.08);
      model['bhh'+d] = new R.Mat(hidden_size, 1);
    }
    // decoder params
    model['Whd'] = new RandMat(output_size, hidden_size, 0, 0.08);
    model['bd'] = new Mat(output_size, 1);
    return model;
  }

   const forwardRNN = function(G, model, hidden_sizes, x, prev) {
    // forward prop for a single tick of RNN
    // G is graph to append ops to
    // model contains RNN parameters
    // x is 1D column vector with observation
    // prev is a struct containing hidden activations from last step

    if(typeof prev.h === 'undefined') {
      let hidden_prevs = [];
      for(let d=0;d<hidden_sizes.length;d++) {
        hidden_prevs.push(new R.Mat(hidden_sizes[d],1)); 
      }
    } else {
      let hidden_prevs = prev.h;
    }

    let hidden = [];
    for(let d=0;d<hidden_sizes.length;d++) {

      let input_vector = d === 0 ? x : hidden[d-1];
      let hidden_prev = hidden_prevs[d];

      let h0 = G.mul(model['Wxh'+d], input_vector);
      let h1 = G.mul(model['Whh'+d], hidden_prev);
      let hidden_d = G.relu(G.add(G.add(h0, h1), model['bhh'+d]));

      hidden.push(hidden_d);
    }

    // one decoder to outputs at end
    let output = G.add(G.mul(model['Whd'], hidden[hidden.length - 1]),model['bd']);

    // return cell memory, hidden representation and output
    return {'h':hidden, 'o' : output};
  }

  const sig = function(x) {
    // helper function for computing sigmoid
    return 1.0/(1+Math.exp(-x));
  }

  const maxi = function(w) {
    // argmax of array w
    let maxv = w[0];
    let maxix = 0;
    for(let i=1,n=w.length;i<n;i++) {
      let v = w[i];
      if(v > maxv) {
        maxix = i;
        maxv = v;
      }
    }
    return maxix;
  }

  const samplei = function(w) {
    // sample argmax from w, assuming w are 
    // probabilities that sum to one
    let r = randf(0,1);
    let x = 0.0;
    let i = 0;
    while(true) {
      x += w[i];
      if(x > r) { return i; }
      i++;
    }
    return w.length - 1; // pretty sure we should never get here?
  }

  // various utils
  global.maxi = maxi;
  global.samplei = samplei;
  global.randi = randi;
  global.softmax = softmax;
  global.assert = assert;

  // classes
  global.Mat = Mat;
  global.RandMat = RandMat;

  global.forwardLSTM = forwardLSTM;
  global.initLSTM = initLSTM;
  global.forwardRNN = forwardRNN;
  global.initRNN = initRNN;

  // optimization
  global.Solver = Solver;
  global.Graph = Graph;
  
})(R);

module.exports = R;
