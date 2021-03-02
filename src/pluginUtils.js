const selectorParser = require('postcss-selector-parser')

function updateAllClasses(selectors, updateClass) {
  let parser = selectorParser((selectors) => {
    selectors.walkClasses((sel) => {
      let updatedClass = updateClass(sel.value, {
        withPseudo(className, pseudo) {
          sel.parent.insertAfter(sel, selectorParser.pseudo({ value: `:${pseudo}` }))
          return className
        },
      })
      sel.value = updatedClass
    })
  })

  let result = parser.processSync(selectors)

  return result
}

function updateLastClasses(selectors, updateClass) {
  let parser = selectorParser((selectors) => {
    selectors.each((sel) => {
      let lastClass = sel.filter(({ type }) => type === 'class').pop()

      if (lastClass === undefined) {
        return
      }

      let updatedClass = updateClass(lastClass.value, {
        withPseudo(className, pseudo) {
          lastClass.parent.insertAfter(lastClass, selectorParser.pseudo({ value: `:${pseudo}` }))
          return className
        },
      })
      lastClass.value = updatedClass
    })
  })
  let result = parser.processSync(selectors)

  return result
}

function ruleIsEmpty([selector, rules]) {
  return Array.isArray(rules) && rules.length === 0
}

function transformRule(rule, transform) {
  let [selector, rules] = rule

  let transformed = transform(rule)

  if (transformed === null) {
    return null
  }

  let [transformedSelector, transformedRules] = transformed

  let result = [
    transformedSelector,
    Array.isArray(transformedRules)
      ? transformedRules.map((rule) => transformRule(rule, transform)).filter(Boolean)
      : transformedRules,
  ]

  if (ruleIsEmpty(result)) {
    return null
  }

  return result
}

function transformAllSelectors(transformSelector, wrap = null) {
  return (pair) => {
    let updatedRules = transformRule(pair, ([selector, rules]) => {
      if (Array.isArray(rules)) {
        return [selector, rules]
      }

      let transformed = selector.split(',').map(transformSelector).join(',')

      if (transformed === null) {
        return null
      }

      return [transformed, rules]
    })

    if (updatedRules === null) {
      return null
    }

    if (wrap !== null) {
      return [wrap, [updatedRules]]
    }

    return updatedRules
  }
}

function transformAllClasses(transformClass, wrap = null) {
  return (pair) => {
    let updatedRules = transformRule(pair, ([selector, rules]) => {
      if (Array.isArray(rules)) {
        return [selector, rules]
      }

      let variantSelector = updateAllClasses(selector, transformClass)

      // if (variantSelector === selector) {
      //   return null
      // }

      return [variantSelector, rules]
    })

    if (updatedRules === null) {
      return null
    }

    if (wrap !== null) {
      return [wrap, [updatedRules]]
    }

    return updatedRules
  }
}

function transformLastClasses(transformClass, wrap = null) {
  return (pair) => {
    let updatedRules = transformRule(pair, ([selector, rules]) => {
      if (Array.isArray(rules)) {
        return [selector, rules]
      }

      let variantSelector = updateLastClasses(selector, transformClass)

      // if (variantSelector === selector) {
      //   return null
      // }

      return [variantSelector, rules]
    })

    if (updatedRules === null) {
      return null
    }

    if (wrap !== null) {
      return [wrap, [updatedRules]]
    }

    return updatedRules
  }
}

module.exports = {
  updateAllClasses,
  updateLastClasses,
  transformRule,
  transformAllSelectors,
  transformAllClasses,
  transformLastClasses,
  createSimpleStaticUtilityPlugin(styles) {
    return function ({ jit: { addUtilities } }) {
      addUtilities(
        Object.entries(styles).reduce((newStyles, [selector, rules]) => {
          newStyles[selector.slice(1)] = [[selector, rules]]
          return newStyles
        }, {})
      )
    }
  },
}
