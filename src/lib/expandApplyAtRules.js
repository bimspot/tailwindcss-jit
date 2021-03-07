const postcss = require('postcss')
const generateRules = require('./generateRules')
const { bigSign } = require('./utils')
const escape = require('tailwindcss/lib/util/escapeClassName').default

function expandApplyAtRules(context) {
  return (root) => {
    let applyCandidates = new Set()

    // Collect all @apply rules and candidates
    let applies = []
    root.walkAtRules('apply', (rule) => {
      for (let util of rule.params.split(/[\s\t\n]+/g)) {
        applyCandidates.add(util)
      }
      applies.push(rule)
    })

    // Start the @apply process if we have rules with @apply in them
    if (applies.length > 0) {
      let classCacheCount = context.classCache.size

      // Fill up some caches!
      generateRules(context.tailwindConfig, applyCandidates, context)

      if (context.classCache.size > classCacheCount) {
        context.stylesheetCache = null
      }

      /**
       * When we have an apply like this:
       *
       * .abc {
       *    @apply hover:font-bold;
       * }
       *
       * What we essentially will do is resolve to this:
       *
       * .abc {
       *    @apply .hover\:font-bold:hover {
       *      font-weight: 500;
       *    }
       * }
       *
       * Notice that the to-be-applied class is `.hover\:font-bold:hover` and that the utility candidate was `hover:font-bold`.
       * What happens in this function is that we prepend a `.` and escape the candidate.
       * This will result in `.hover\:font-bold`
       * Which means that we can replace `.hover\:font-bold` with `.abc` in `.hover\:font-bold:hover` resulting in `.abc:hover`
       */
      // TODO: Should we use postcss-selector-parser for this instead?
      function replaceSelector(selector, utilitySelector, candidate) {
        return selector
          .split(/\s*,\s*/g)
          .map((s) => utilitySelector.replace(`.${escape(candidate)}`, s))
          .join(', ')
      }

      for (let apply of applies) {
        let siblings = []
        let applyCandidates = apply.params.split(/[\s\t\n]+/g)
        for (let applyCandidate of applyCandidates) {
          // TODO: Check for user css rules?
          if (!context.classCache.has(applyCandidate)) {
            throw new Error('Utility does not exist!')
          }

          let rules = context.classCache.get(applyCandidate)

          for (let [meta, node] of rules) {
            let root = postcss.root({ nodes: [node] })

            root.walkRules((rule) => {
              rule.selector = replaceSelector(apply.parent.selector, rule.selector, applyCandidate)
            })

            siblings.push([meta, root.nodes[0]])
          }
        }

        // Inject the rules, sorted, correctly
        for (let [, sibling] of siblings.sort(([a], [z]) => bigSign(z.sort - a.sort))) {
          // `apply.parent` is referring to the node at `.abc` in: .abc { @apply mt-2 }
          apply.parent.after(sibling)
        }

        // If there are left-over declarations, just remove the @apply
        if (apply.parent.nodes.length > 1) {
          apply.remove()
        } else {
          // The node is empty, drop the full node
          apply.parent.remove()
        }
      }
    }
  }
}

module.exports = expandApplyAtRules