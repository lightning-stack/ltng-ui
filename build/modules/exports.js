import * as ltng_ui from '../../ltng-ui.js'
import * as ltng_testingtools from '../../ltng-testingtools/index.mjs'
import * as ltng_tools from '../../ltng-tools/index.mjs'
import * as ltng_book from '../../ltng-book/ltng-book.mjs'
import * as ltng_components from '../../ltng-components/index.mjs'

Object.assign(window, ltng_ui)
Object.assign(window, ltng_testingtools)
Object.assign(window, ltng_tools)
Object.assign(window, ltng_book)
Object.assign(window, ltng_components)

export {
    ltng_ui,
    ltng_testingtools,
    ltng_tools,
    ltng_components,
    ltng_book
}
