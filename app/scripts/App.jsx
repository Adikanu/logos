import React from 'react';
import Isvg from 'react-inlinesvg';
import { autobind } from 'core-decorators';
import _filter from 'lodash/filter';
import _orderBy from 'lodash/orderBy';
import _take from 'lodash/take';
import _escapeRegExp from 'lodash/escapeRegExp';

import Storage from './utils/Storage';
import json from '../logos.json';

import Header from './components/Header';
import Footer from './components/Footer';
import Logo from './components/Logo';
import Icon from './components/Icon';

let searchTimeout;

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      category: 'categories',
      categoryMenuVisible: false,
      columns: 3,
      favorites: false,
      logos: json.items,
      tag: undefined,
      tagCloudVisible: false
    };
  }

  componentWillMount() {
    const category = Storage.getItem('category');
    const columns = Storage.getItem('columns');

    this.setState({
      category: category && category !== 'everybody' && this.state.category !== category ? category : this.state.category,
      columns: columns && this.state.columns !== columns ? columns : this.state.columns
    });

    if (location.hash === '#fav') {
      this.setState({
        favorites: true
      });
    }
  }

  componentDidMount() {
    document.body.addEventListener('keydown', (e) => {
      const intKey = (window.Event) ? e.which : e.keyCode;
      let action;

      if ((intKey === 189 || intKey === 109) && this.state.columns > 1) {
        this.changeColumns(this.state.columns - 1);
        action = 'column-down';
      }

      if ((intKey === 187 || intKey === 107) && this.state.columns < 5) {
        this.changeColumns(this.state.columns + 1);
        action = 'column-up';
      }
      if (intKey === 27) {
        if (this.state.tagCloudVisible) {
          this.toggleTagCloudVisibility();
        }

        if (this.state.categoryMenuVisible) {
          this.toggleCategoryMenuVisibility();
        }
        action = 'escape';
      }

      if (action) {
        this.trackEvent('keyboard', 'press', action);
      }
    });

    window.addEventListener('scroll', (e) => {
      if ((document.body.scrollTop >= 1000 && document.body.clientHeight > 4000) && !this.state.tagCloudVisible && !this.state.scrollable) {
        this.setState({
          scrollable: true
        });
      }
      else if (e.target.body.scrollTop < 1000 && this.state.scrollable) {
        this.setState({
          scrollable: false
        });
      }
    });
  }

  @autobind
  trackEvent(category, type, label) {
    const options = {
      eventCategory: category,
      eventAction: type
    };

    if (label) {
      options.eventLabel = label;
    }

    ga('send', 'event', options);
  }

  @autobind
  onClickChangeColumns(e) {
    e.preventDefault();
    const el = e.currentTarget;
    const col = +el.dataset.column;

    this.changeColumns(this.state.columns + col);
    this.trackEvent('switch', 'click', col > 0 ? 'up' : 'down');
  }

  changeColumns(num) {
    this.setState({
      columns: num
    });
    Storage.setItem('columns', num);
  }

  @autobind
  onClickChangeView(e) {
    e.preventDefault();
    const type = e.currentTarget.dataset.value;

    this.changeCategory(type === 'all' ? 'everybody' : 'categories');
    this.setState({
      favorites: type === 'favorites'
    });

    this.trackEvent('view', 'click', type);
  }

  @autobind
  changeCategory(value) {
    this.setState({
      category: value,
      favorites: false,
      tag: undefined,
      search: undefined
    });

    if (value !== 'everybody') {
      Storage.setItem('category', value);
    }
  }

  @autobind
  toggleCategoryMenuVisibility() {
    document.body.style.overflow = !this.state.categoryMenuVisible ? 'hidden' : 'auto';
    this.setState({
      categoryMenuVisible: !this.state.categoryMenuVisible
    });
  }

  @autobind
  onClickTag(e) {
    e.preventDefault();
    const tag = e.currentTarget.dataset.tag || undefined;

    document.body.style.overflow = !this.state.tagCloudVisible ? 'hidden' : 'auto';
    this.changeTag(tag);
    this.trackEvent('tag', 'info', tag);
  }

  @autobind
  onClickShowTags(e) {
    if (e) {
      e.preventDefault();
    }

    if (this.state.tag) {
      this.setState({
        tag: undefined
      });
      this.trackEvent('tag-cloud', 'hide', this.state.tag);
    }
    else {
      this.toggleTagCloudVisibility();
      this.trackEvent('tag-cloud', 'show');
    }
  }

  toggleTagCloudVisibility() {
    document.body.style.overflow = !this.state.tagCloudVisible ? 'hidden' : 'auto';
    this.setState({
      tagCloudVisible: !this.state.tagCloudVisible
    });
  }

  @autobind
  changeTag(tag) {
    document.body.style.overflow = 'auto';
    this.scrollTo(document.body, 0, window.scrollY / 10 < 500 ? window.scrollY / 10 : 500);

    this.setState({
      category: 'categories',
      favorites: false,
      search: undefined,
      tag,
      tagCloudVisible: false
    });
  }

  @autobind
  searchLogos(e) {
    let search;

    if (typeof e === 'object') {
      if (e.type === 'click') {
        e.preventDefault();
        e.currentTarget.parentNode.previousSibling.focus();
      }
      else if (e.type === 'change') {
        search = e.target.value;
      }
    }

    if (search && search.length > 1) {
      clearTimeout(searchTimeout);

      searchTimeout = setTimeout(() => {
        this.trackEvent('search', 'submit', search);
      }, 500);
    }

    this.setState({
      category: 'categories',
      favorites: false,
      search: search || undefined,
      tag: undefined
    });
  }

  scrollTo(element = document.body, to = 0, duration = document.body.scrollTop) {
    const newDuration = duration / 10 < 500 ? duration : 500;

    const difference = to - element.scrollTop;
    const perTick = difference / duration * 10;
    let timeout;

    if (newDuration < 0) {
      clearTimeout(timeout);
      return;
    }

    timeout = setTimeout(() => {
      element.scrollTop = element.scrollTop + perTick;

      if (element.scrollTop === to) {
        clearTimeout(timeout);
      }
      this.scrollTo(element, to, newDuration - 10);
    }, 10);
  }

  @autobind
  scrollTop(e) {
    e.preventDefault();

    this.scrollTo(document.body, 0, window.scrollY / 10 < 500 ? window.scrollY / 10 : 500);
    this.trackEvent('scroll', 'click');
  }

  render() {
    const state = this.state;
    const latest = (state.category === 'categories' && !state.tag && !state.search);
    const favorites = (state.favorites && state.category === 'categories' && !state.tag && !state.search);
    const heading = favorites ? 'Favorites' : (latest ? 'Latest additions' : '');
    const logos = [];
    let db = state.logos;
    let hidden = false;
    let visible = 0;

    if (favorites) {
      db = _filter(json.items, 'favorite', true);
    }
    else if (latest) {
      db = _orderBy(json.items, ['updated', 'name'], ['desc', 'asc']);
      db = _take(db, 50);
    }

    db.forEach((d, i) => {
      if (state.search) {
        hidden = !d.name.match(new RegExp(_escapeRegExp(state.search), 'i'));
      }
      else if (state.tag) {
        hidden = d.tags.indexOf(state.tag) === -1;
      }
      else if (state.category !== 'categories' && state.category !== 'everybody') {
        hidden = d.categories.indexOf(state.category) === -1;
      }

      d.files.forEach((f, j) => {
        logos.push(
          <Logo
            key={`${i}-${j}`}
            info={d}
            image={f}
            hidden={hidden}
            onClickTag={this.onClickTag}
            trackEvent={this.trackEvent} />
        );
      }, this);

      if (!hidden) {
        visible++;
      }
    }, this);

    logos.push(<li key="nothing" className="nothing">Nothing Found</li>);

    return (
      <div className="app">
        <Isvg src="media/icons.svg" uniquifyIDs={false} />

        <div className="container">
          <Header
            changeCategory={this.changeCategory}
            changeTag={this.changeTag}
            onClickChangeView={this.onClickChangeView}
            onClickChangeColumns={this.onClickChangeColumns}
            onSearch={this.searchLogos}
            onClickShowTagCloud={this.onClickShowTags}
            state={
              {
                logos: state.logos,
                category: state.category,
                categoryMenuVisible: state.categoryMenuVisible,
                columns: state.columns,
                favorites,
                heading,
                search: state.search,
                tag: state.tag,
                tagCloudVisible: state.tagCloudVisible
              }
            }
            toggleCategoryMenu={this.toggleCategoryMenuVisibility}
            trackEvent={this.trackEvent}
            visible={visible} />
          <main>
            <ul className={`logos col-${state.columns}${(!visible ? ' empty' : '')}`}>
              {logos}
            </ul>
          </main>
          <Footer />
        </div>
        <a
          href="#"
          onClick={this.scrollTop}
          className={`scroll-top${(state.scrollable ? ' visible' : '')}`}>
          <Icon id="caret-up" />
        </a>
      </div>
    );
  }
}

export default App;
